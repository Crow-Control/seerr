import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { getSettings, type MusicBrainzSettings } from '@server/lib/settings';
import { getAppVersion } from '@server/utils/appVersion';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { MbAlbumDetails, MbArtistDetails } from './interfaces';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export const getDefaultMusicBrainzUserAgent = (): string =>
  `Seerr/${getAppVersion()}`;

/**
 * Strip any trailing `/ws/<digits>` segment from a URL pathname so it can be
 * used as a "web root" for endpoints that live outside `/ws/2`.
 */
const stripWsSuffix = (pathname: string): string =>
  pathname.replace(/\/ws\/\d+\/?$/, '').replace(/\/+$/, '');

/**
 * Normalize a user-supplied MusicBrainz base URL so it always points at the
 * web-service root. Accepts host-only URLs (e.g. "https://musicbrainz.org")
 * as well as fully-qualified ones (e.g. "https://musicbrainz.org/ws/2") and
 * appends "/ws/2" when no "/ws/<version>" segment is present.
 */
export const resolveMusicBrainzApiUrl = (baseUrl: string): string => {
  const trimmed = (baseUrl || 'https://musicbrainz.org').replace(/\/+$/, '');
  if (/\/ws\/\d+$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/ws/2`;
};

class MusicBrainz extends ExternalAPI {
  private settings: MusicBrainzSettings;

  constructor(overrideSettings?: MusicBrainzSettings) {
    const musicbrainz =
      overrideSettings ?? getSettings().musicMetadata.musicbrainz;
    const headers: Record<string, string> = {
      'User-Agent': getDefaultMusicBrainzUserAgent(),
      Accept: 'application/json',
    };
    if (musicbrainz.authToken) {
      headers.Authorization = `Token ${musicbrainz.authToken}`;
    }
    const maxRPS = (() => {
      const n = Number(musicbrainz.maxRPS);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    })();
    super(
      resolveMusicBrainzApiUrl(musicbrainz.baseUrl),
      {},
      {
        headers,
        nodeCache: cacheManager.getCache('musicbrainz').data,
        rateLimit: {
          maxRequests: maxRPS,
          maxRPS,
        },
      }
    );
    this.settings = musicbrainz;
  }

  public async searchAlbum({
    query,
    limit = 30,
    offset = 0,
  }: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<MbAlbumDetails[]> {
    try {
      const data = await this.get<{
        created: string;
        count: number;
        offset: number;
        'release-groups': MbAlbumDetails[];
      }>(
        '/release-group',
        {
          params: {
            query,
            fmt: 'json',
            limit: limit.toString(),
            offset: offset.toString(),
          },
        },
        43200
      );

      return data['release-groups'];
    } catch (e) {
      throw new Error(
        `[MusicBrainz] Failed to search albums: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }

  public async searchArtist({
    query,
    limit = 50,
    offset = 0,
  }: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<MbArtistDetails[]> {
    try {
      const data = await this.get<{
        created: string;
        count: number;
        offset: number;
        artists: MbArtistDetails[];
      }>(
        '/artist',
        {
          params: {
            query,
            fmt: 'json',
            limit: limit.toString(),
            offset: offset.toString(),
          },
        },
        43200
      );

      return data.artists;
    } catch (e) {
      throw new Error(
        `[MusicBrainz] Failed to search artists: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }

  public async getArtistWikipediaExtract({
    artistMbid,
    language = 'en',
  }: {
    artistMbid: string;
    language?: string;
  }): Promise<{ title: string; url: string; content: string } | null> {
    if (
      !artistMbid ||
      typeof artistMbid !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        artistMbid
      )
    ) {
      throw new Error('Invalid MusicBrainz artist ID format');
    }

    try {
      const musicbrainz = this.settings;
      // The wikipedia-extract endpoint lives on the MB website root, not
      // under /ws/2 — derive the host (and any configured subpath, e.g.
      // when self-hosted behind a reverse proxy at `/musicbrainz`) from
      // the configured base URL. Only http(s) URLs are accepted to avoid
      // server-side request forgery via exotic protocol handlers.
      let webRoot = 'https://musicbrainz.org';
      try {
        const parsed = new URL(resolveMusicBrainzApiUrl(musicbrainz.baseUrl));
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`Unsupported protocol: ${parsed.protocol}`);
        }
        const basePath = stripWsSuffix(parsed.pathname);
        webRoot = `${parsed.origin}${basePath}`;
      } catch {
        /* fall back to default */
      }
      const safeUrl = `${webRoot}/artist/${artistMbid}/wikipedia-extract`;

      // Use `this.axios` so the request goes through the same request
      // interceptor (proxy config) and rate limiter as the rest of the
      // MusicBrainz client.
      const response = await this.axios.get(safeUrl, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': language,
          'User-Agent': getDefaultMusicBrainzUserAgent(),
          ...(musicbrainz.authToken
            ? { Authorization: `Token ${musicbrainz.authToken}` }
            : {}),
        },
      });

      const data = response.data;
      if (!data.wikipediaExtract || !data.wikipediaExtract.content) {
        return null;
      }

      const cleanContent = purify.sanitize(data.wikipediaExtract.content, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });

      return {
        title: data.wikipediaExtract.title,
        url: data.wikipediaExtract.url,
        content: cleanContent.trim(),
      };
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch Wikipedia extract: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  public async getReleaseGroup({
    releaseId,
  }: {
    releaseId: string;
  }): Promise<string | null> {
    try {
      const data = await this.get<{
        'release-group': {
          id: string;
        };
      }>(
        `/release/${releaseId}`,
        {
          params: {
            inc: 'release-groups',
            fmt: 'json',
          },
        },
        43200
      );

      return data['release-group']?.id ?? null;
    } catch (e) {
      throw new Error(
        `[MusicBrainz] Failed to fetch release group: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }
}

export default MusicBrainz;

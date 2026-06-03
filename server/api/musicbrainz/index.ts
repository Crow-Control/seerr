import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { MbAlbumDetails, MbArtistDetails } from './interfaces';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

class MusicBrainz extends ExternalAPI {
  constructor() {
    const { musicbrainz } = getSettings().musicMetadata;
    const headers: Record<string, string> = {
      'User-Agent':
        musicbrainz.userAgent || 'Seerr (https://github.com/seerr-team/seerr)',
      Accept: 'application/json',
    };
    if (musicbrainz.authToken) {
      headers.Authorization = `Token ${musicbrainz.authToken}`;
    }
    const maxRPS = musicbrainz.maxRPS > 0 ? musicbrainz.maxRPS : 1;
    super(
      musicbrainz.baseUrl || 'https://musicbrainz.org/ws/2',
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
        `[MusicBrainz] Failed to search albums: ${e instanceof Error ? e.message : 'Unknown error'
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
        `[MusicBrainz] Failed to search artists: ${e instanceof Error ? e.message : 'Unknown error'
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
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        artistMbid
      )
    ) {
      throw new Error('Invalid MusicBrainz artist ID format');
    }

    try {
      const { musicbrainz } = getSettings().musicMetadata;
      // The wikipedia-extract endpoint lives on the MB website root,
      // not under /ws/2 — derive the host from the configured base URL.
      let webRoot = 'https://musicbrainz.org';
      try {
        webRoot = new URL(musicbrainz.baseUrl).origin;
      } catch {
        /* fall back to default */
      }
      const safeUrl = `${webRoot}/artist/${artistMbid}/wikipedia-extract`;

      const response = await axios.get(safeUrl, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': language,
          'User-Agent':
            musicbrainz.userAgent ||
            'Seerr (https://github.com/seerr-team/seerr)',
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
        `[MusicBrainz] Failed to fetch Wikipedia extract: ${error instanceof Error ? error.message : 'Unknown error'
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
        `[MusicBrainz] Failed to fetch release group: ${e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }
}

export default MusicBrainz;

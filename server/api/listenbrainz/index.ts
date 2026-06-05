import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import type {
  LbAlbumDetails,
  LbArtistDetails,
  LbFreshReleasesResponse,
  LbTopAlbumsResponse,
  LbTopArtistsResponse,
} from './interfaces';

class ListenBrainzAPI extends ExternalAPI {
  private webBaseUrl: string;

  constructor() {
    const { listenbrainz } = getSettings().musicMetadata;
    const headers: Record<string, string> = {};
    if (listenbrainz.userToken) {
      headers.Authorization = `Token ${listenbrainz.userToken}`;
    }
    super(
      listenbrainz.apiBaseUrl || 'https://api.listenbrainz.org/1',
      {},
      {
        headers,
        nodeCache: cacheManager.getCache('listenbrainz').data,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 25,
        },
      }
    );
    this.webBaseUrl = listenbrainz.webBaseUrl || 'https://listenbrainz.org';
  }

  public async getAlbum(mbid: string): Promise<LbAlbumDetails> {
    try {
      return await this.post<LbAlbumDetails>(
        `/album/${mbid}`,
        {},
        {
          baseURL: this.webBaseUrl,
        },
        43200
      );
    } catch (e) {
      throw new Error(
        `[ListenBrainz] Failed to fetch album details: ${e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }

  public async getArtist(mbid: string): Promise<LbArtistDetails> {
    try {
      return await this.post<LbArtistDetails>(
        `/artist/${mbid}`,
        {},
        {
          baseURL: this.webBaseUrl,
        },
        43200
      );
    } catch (e) {
      throw new Error(
        `[ListenBrainz] Failed to fetch artist details: ${e instanceof Error ? e.message : 'Unknown error'
        }`
      );
    }
  }

  public async getTopAlbums({
    offset = 0,
    range = 'month',
    count = 20,
  }: {
    offset?: number;
    range?: string;
    count?: number;
  }): Promise<LbTopAlbumsResponse> {
    return this.get<LbTopAlbumsResponse>(
      '/stats/sitewide/release-groups',
      {
        params: {
          offset: offset.toString(),
          range,
          count: count.toString(),
        },
      },
      43200
    );
  }

  public async getTopArtists({
    offset = 0,
    range = 'month',
    count = 20,
  }: {
    offset?: number;
    range?: string;
    count?: number;
  }): Promise<LbTopArtistsResponse> {
    return this.get<LbTopArtistsResponse>(
      '/stats/sitewide/artists',
      {
        params: {
          offset: offset.toString(),
          range,
          count: count.toString(),
        },
      },
      43200
    );
  }

  public async getFreshReleases({
    days = 7,
    sort = 'release_date',
    offset = 0,
    count = 20,
  }: {
    days?: number;
    sort?: string;
    offset?: number;
    count?: number;
  } = {}): Promise<LbFreshReleasesResponse> {
    return this.get<LbFreshReleasesResponse>(
      '/explore/fresh-releases',
      {
        params: {
          days: days.toString(),
          sort,
          offset: offset.toString(),
          count: count.toString(),
        },
      },
      43200
    );
  }
}

export default ListenBrainzAPI;

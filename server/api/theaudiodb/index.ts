import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import type { TadbArtistResponse } from './interfaces';

class TheAudioDb extends ExternalAPI {
  private readonly apiKey = '195003';
  private readonly CACHE_TTL = 43200;

  constructor() {
    super(
      'https://www.theaudiodb.com/api/v1/json',
      {},
      {
        nodeCache: cacheManager.getCache('tadb').data,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 25,
        },
      }
    );
  }

  private createEmptyResponse() {
    return { artistThumb: null, artistBackground: null };
  }

  public async getArtistImages(
    id: string
  ): Promise<{ artistThumb: string | null; artistBackground: string | null }> {
    try {
      const data = await this.get<TadbArtistResponse>(
        `/${this.apiKey}/artist-mb.php`,
        { params: { i: id } },
        this.CACHE_TTL
      );

      return {
        artistThumb: data.artists?.[0]?.strArtistThumb || null,
        artistBackground: data.artists?.[0]?.strArtistFanart || null,
      };
    } catch (error) {
      logger.error('Failed to fetch artist images', {
        label: 'TheAudioDb',
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.createEmptyResponse();
    }
  }
}

export default TheAudioDb;

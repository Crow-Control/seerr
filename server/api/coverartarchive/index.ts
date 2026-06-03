import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import type { CoverArtResponse } from './interfaces';

class CoverArtArchive extends ExternalAPI {
  private readonly CACHE_TTL = 43200;

  constructor() {
    super(
      'https://coverartarchive.org',
      {},
      {
        nodeCache: cacheManager.getCache('covertartarchive').data,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 50,
        },
      }
    );
  }

  private createEmptyResponse(id: string): CoverArtResponse {
    return { images: [], release: `/release/${id}` };
  }

  public async getCoverArt(id: string): Promise<CoverArtResponse> {
    try {
      const data = await this.get<CoverArtResponse>(
        `/release-group/${id}`,
        undefined,
        this.CACHE_TTL
      );

      const releaseMBID = data.release.split('/').pop();

      data.images = data.images.map((image) => {
        const fullUrl = `https://archive.org/download/mbid-${releaseMBID}/mbid-${releaseMBID}-${image.id}_thumb250.jpg`;
        return {
          approved: image.approved,
          front: image.front,
          id: image.id,
          thumbnails: { 250: fullUrl },
        };
      });

      return data;
    } catch (error) {
      logger.error('Failed to fetch cover art', {
        label: 'CoverArtArchive',
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.createEmptyResponse(id);
    }
  }
}

export default CoverArtArchive;

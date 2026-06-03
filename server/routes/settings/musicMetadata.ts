import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import { getSettings, type MusicMetadataSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

function getTestResultString(testValue: number): string {
    if (testValue === -1) return 'not tested';
    if (testValue === 0) return 'failed';
    return 'ok';
}

const musicMetadataRoutes = Router();

musicMetadataRoutes.get('/', (_req, res) => {
    const { musicMetadata } = getSettings();
    res.status(200).json(musicMetadata);
});

musicMetadataRoutes.put('/', async (req, res) => {
    const settings = getSettings();
    const body = req.body as Partial<MusicMetadataSettings>;

    const current = settings.musicMetadata;
    const updated: MusicMetadataSettings = {
        musicbrainz: {
            ...current.musicbrainz,
            ...(body.musicbrainz ?? {}),
        },
        listenbrainz: {
            ...current.listenbrainz,
            ...(body.listenbrainz ?? {}),
        },
    };

    // Sanity defaults
    if (!updated.musicbrainz.baseUrl) {
        updated.musicbrainz.baseUrl = 'https://musicbrainz.org/ws/2';
    }
    if (!updated.musicbrainz.userAgent) {
        updated.musicbrainz.userAgent =
            'Seerr (https://github.com/seerr-team/seerr)';
    }
    if (!updated.musicbrainz.maxRPS || updated.musicbrainz.maxRPS < 1) {
        updated.musicbrainz.maxRPS = 1;
    }
    if (!updated.listenbrainz.apiBaseUrl) {
        updated.listenbrainz.apiBaseUrl = 'https://api.listenbrainz.org/1';
    }
    if (!updated.listenbrainz.webBaseUrl) {
        updated.listenbrainz.webBaseUrl = 'https://listenbrainz.org';
    }

    settings.musicMetadata = updated;
    await settings.save();

    res.status(200).json({ success: true, ...updated });
});

musicMetadataRoutes.post('/test', async (_req, res) => {
    let mbTest = -1;
    let lbTest = -1;

    try {
        mbTest = 0;
        const mb = new MusicBrainz();
        await mb.searchAlbum({ query: 'test', limit: 1 });
        mbTest = 1;
    } catch (e) {
        logger.error('Failed to test MusicBrainz', {
            label: 'MusicMetadata',
            message: e instanceof Error ? e.message : 'Unknown error',
        });
    }

    try {
        lbTest = 0;
        const lb = new ListenBrainzAPI();
        await lb.getFreshReleases({ days: 1, count: 1 });
        lbTest = 1;
    } catch (e) {
        logger.error('Failed to test ListenBrainz', {
            label: 'MusicMetadata',
            message: e instanceof Error ? e.message : 'Unknown error',
        });
    }

    const success = mbTest === 1 && lbTest === 1;

    return res.status(success ? 200 : 500).json({
        success,
        tests: {
            musicbrainz: getTestResultString(mbTest),
            listenbrainz: getTestResultString(lbTest),
        },
    });
});

export default musicMetadataRoutes;

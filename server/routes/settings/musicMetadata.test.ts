import ExternalAPI from '@server/api/externalapi';
import Settings, { getSettings } from '@server/lib/settings';
import musicMetadataRoutes from '@server/routes/settings/musicMetadata';
import express, { type Express } from 'express';
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';

interface CallRecord {
  baseURL?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

function captureExternalAPI(): {
  getCalls: CallRecord[];
  getImpl: { fn: () => unknown };
} {
  const getCalls: CallRecord[] = [];
  const getImpl = { fn: () => ({}) as unknown };

  const externalProto = ExternalAPI.prototype as unknown as {
    get: (...args: unknown[]) => Promise<unknown>;
  };

  mock.method(
    externalProto,
    'get',
    async function (this: { baseUrl?: string }, ..._args: unknown[]) {
      // Cast to the local args shape so we capture what the production
      // code is sending to the upstream client.
      const config = _args[1] as
        | { params?: Record<string, string>; headers?: Record<string, string> }
        | undefined;
      getCalls.push({
        baseURL: this?.baseUrl,
        params: config?.params,
        headers: config?.headers,
      });
      return getImpl.fn();
    }
  );

  return { getCalls, getImpl };
}

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use('/', musicMetadataRoutes);
});

beforeEach(() => {
  // Prevent the route from writing settings.json during the PUT test.
  mock.method(Settings.prototype, 'save', async () => undefined);

  // Reset the singleton-backed settings to a known state. The Settings
  // class merges incoming values, so we set the music metadata explicitly
  // to known "saved" values.
  const settings = getSettings();
  settings.musicMetadata = {
    musicbrainz: {
      baseUrl: 'https://saved.example/ws/2',
      authToken: 'saved-token',
      maxRPS: 1,
    },
  };
});

afterEach(() => {
  mock.restoreAll();
});

describe('GET /', () => {
  it('returns the persisted settings without a userAgent field', async () => {
    const res = await request(app).get('/');

    assert.equal(res.status, 200);
    assert.ok(
      !('userAgent' in res.body.musicbrainz),
      'GET response must not expose a derived userAgent that the UI could persist back'
    );
    assert.equal(res.body.musicbrainz.baseUrl, 'https://saved.example/ws/2');
  });
});

describe('PUT /', () => {
  it('strips any userAgent field sent in the body', async () => {
    const res = await request(app)
      .put('/')
      .send({
        musicbrainz: {
          baseUrl: 'https://updated.example/ws/2',
          authToken: 'new-token',
          maxRPS: 2,
          // Older clients may still post a userAgent; the route must not
          // persist it.
          userAgent: 'Old-Hardcoded-UA/1.0',
        },
      });

    assert.equal(res.status, 200);
    assert.ok(!('userAgent' in res.body.musicbrainz));
    assert.equal(
      getSettings().musicMetadata.musicbrainz.baseUrl,
      'https://updated.example/ws/2'
    );
    assert.ok(
      !(
        'userAgent' in
        (getSettings().musicMetadata.musicbrainz as unknown as Record<
          string,
          unknown
        >)
      ),
      'PUT must not persist a userAgent on the settings object'
    );
  });
});

describe('POST /test', () => {
  // Regression: the handler previously ignored req.body and rebuilt the
  // clients from `getSettings()`, so the Test button could pass against
  // stale persisted values while the form contained broken candidate
  // values.
  it('tests the candidate config sent in the body, not the saved settings', async () => {
    const { getCalls, getImpl } = captureExternalAPI();
    getImpl.fn = () => ({
      'release-groups': [],
      payload: { releases: [] },
    });

    const res = await request(app)
      .post('/test')
      .send({
        musicbrainz: {
          baseUrl: 'https://candidate.example/ws/2',
          authToken: 'candidate-token',
          maxRPS: 1,
        },
      });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tests, {
      musicbrainz: 'ok',
    });

    // The MusicBrainz client must have been built against the candidate
    // base URL, not the saved one.
    const baseURLs = getCalls.map((c) => c.baseURL);
    assert.ok(
      baseURLs.some((url) => url === 'https://candidate.example/ws/2'),
      `expected a request against the candidate MusicBrainz baseURL, got ${JSON.stringify(baseURLs)}`
    );
    assert.ok(
      !baseURLs.includes('https://saved.example/ws/2'),
      'must not have made a request against the previously-saved MusicBrainz baseURL'
    );
  });

  it('reports per-provider failures with a 500 status when a client throws', async () => {
    const { getImpl } = captureExternalAPI();
    getImpl.fn = () => {
      throw new Error('upstream down');
    };

    const res = await request(app).post('/test').send({});

    assert.equal(res.status, 500);
    assert.equal(res.body.tests.musicbrainz, 'failed');
  });

  it('falls back to the saved config when the request body is empty', async () => {
    const { getCalls, getImpl } = captureExternalAPI();
    getImpl.fn = () => ({
      'release-groups': [],
      payload: { releases: [] },
    });

    const res = await request(app).post('/test').send({});

    assert.equal(res.status, 200);
    const baseURLs = getCalls.map((c) => c.baseURL);
    assert.ok(baseURLs.includes('https://saved.example/ws/2'));
  });
});

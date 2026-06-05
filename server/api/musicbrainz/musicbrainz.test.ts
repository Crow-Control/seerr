import ExternalAPI from '@server/api/externalapi';
import MusicBrainz, { resolveMusicBrainzApiUrl } from '@server/api/musicbrainz';
import type {
  MbAlbumDetails,
  MbArtistDetails,
} from '@server/api/musicbrainz/interfaces';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

interface GetCall {
  endpoint: string;
  config?: { params?: Record<string, string> };
  ttl?: number;
}

interface MockGet {
  calls: GetCall[];
  impl: (call: GetCall) => unknown;
}

function installGetMock(): MockGet {
  const state: MockGet = {
    calls: [],
    impl: () => ({}),
  };
  // `get` is `protected` in TS but a regular method at runtime.
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (...args: unknown[]) => Promise<unknown>;
    },
    'get',
    async (
      endpoint: string,
      config?: { params?: Record<string, string> },
      ttl?: number
    ) => {
      const call: GetCall = { endpoint, config, ttl };
      state.calls.push(call);
      return state.impl(call);
    }
  );
  return state;
}

function fakeAlbum(id: string, title = 'Test Album'): MbAlbumDetails {
  return {
    id,
    title,
    'primary-type': 'Album',
    'first-release-date': '2024-01-01',
  } as unknown as MbAlbumDetails;
}

function fakeArtist(id: string, name = 'Test Artist'): MbArtistDetails {
  return {
    id,
    name,
    type: 'Group',
  } as unknown as MbArtistDetails;
}

describe('MusicBrainz API client', () => {
  let getMock: MockGet;

  beforeEach(() => {
    getMock = installGetMock();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('resolveMusicBrainzApiUrl', () => {
    it('appends /ws/2 when only a host is given', () => {
      assert.equal(
        resolveMusicBrainzApiUrl('https://musicbrainz.org'),
        'https://musicbrainz.org/ws/2'
      );
    });

    it('keeps an explicit /ws/<n> suffix untouched', () => {
      assert.equal(
        resolveMusicBrainzApiUrl('https://musicbrainz.org/ws/2'),
        'https://musicbrainz.org/ws/2'
      );
      assert.equal(
        resolveMusicBrainzApiUrl('https://example.org/ws/3'),
        'https://example.org/ws/3'
      );
    });

    it('strips trailing slashes before appending', () => {
      assert.equal(
        resolveMusicBrainzApiUrl('https://musicbrainz.org/'),
        'https://musicbrainz.org/ws/2'
      );
      assert.equal(
        resolveMusicBrainzApiUrl('https://musicbrainz.org/ws/2/'),
        'https://musicbrainz.org/ws/2'
      );
    });

    it('falls back to the public root when given an empty value', () => {
      assert.equal(
        resolveMusicBrainzApiUrl(''),
        'https://musicbrainz.org/ws/2'
      );
    });
  });

  // Regression: the test endpoint must validate the candidate config the
  // admin is editing, not the last-persisted settings. That requires the
  // client to accept an override settings object at construction time AND
  // for those overrides to actually drive outbound request behavior.
  describe('constructor override settings', () => {
    it('uses overridden baseUrl/authToken/maxRPS instead of the global settings', async () => {
      const override = {
        baseUrl: 'https://mb.override.example/ws/2',
        authToken: 'override-token',
        maxRPS: 4,
      };
      const mb = new MusicBrainz(override);
      const internals = mb as unknown as {
        settings: typeof override;
        axios: {
          defaults: { baseURL?: string };
          getUri: (config?: { url?: string }) => string;
        };
      };

      assert.equal(internals.settings.baseUrl, override.baseUrl);
      assert.equal(internals.settings.authToken, override.authToken);
      assert.equal(internals.settings.maxRPS, override.maxRPS);

      // The overridden baseUrl must propagate to the underlying axios
      // client so subsequent requests actually go to the override host,
      // not the public default.
      assert.equal(
        internals.axios.defaults.baseURL,
        'https://mb.override.example/ws/2'
      );

      // axios resolves request URLs against `defaults.baseURL`, so the
      // override should be visible when computing a request URL.
      assert.equal(
        internals.axios.getUri({ url: '/release-group' }),
        'https://mb.override.example/ws/2/release-group'
      );

      // And triggering an actual call routes through the get() sink
      // (the mock proves the request reached the client layer).
      getMock.impl = () => ({ 'release-groups': [] });
      await mb.searchAlbum({ query: 'override' });
      assert.equal(getMock.calls.length, 1);
      assert.equal(getMock.calls[0].endpoint, '/release-group');
    });
  });

  describe('searchAlbum', () => {
    it('queries the /release-group endpoint with json fmt and pagination', async () => {
      getMock.impl = () => ({
        created: '2024-01-01',
        count: 1,
        offset: 0,
        'release-groups': [fakeAlbum('mb-album-1')],
      });

      const mb = new MusicBrainz();
      const result = await mb.searchAlbum({
        query: 'foo',
        limit: 5,
        offset: 10,
      });

      assert.equal(getMock.calls.length, 1);
      const call = getMock.calls[0];
      assert.equal(call.endpoint, '/release-group');
      assert.deepEqual(call.config?.params, {
        query: 'foo',
        fmt: 'json',
        limit: '5',
        offset: '10',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'mb-album-1');
    });

    it('uses default limit (30) and offset (0)', async () => {
      getMock.impl = () => ({ 'release-groups': [] });

      const mb = new MusicBrainz();
      await mb.searchAlbum({ query: 'bar' });

      assert.deepEqual(getMock.calls[0].config?.params, {
        query: 'bar',
        fmt: 'json',
        limit: '30',
        offset: '0',
      });
    });

    it('wraps upstream errors with a [MusicBrainz] prefix', async () => {
      getMock.impl = () => {
        throw new Error('boom');
      };

      const mb = new MusicBrainz();
      await assert.rejects(
        () => mb.searchAlbum({ query: 'x' }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(
            err.message,
            /^\[MusicBrainz\] Failed to search albums:/
          );
          assert.match(err.message, /boom/);
          return true;
        }
      );
    });
  });

  describe('searchArtist', () => {
    it('queries the /artist endpoint and returns artists', async () => {
      getMock.impl = () => ({
        artists: [fakeArtist('mb-artist-1'), fakeArtist('mb-artist-2')],
      });

      const mb = new MusicBrainz();
      const result = await mb.searchArtist({ query: 'baz', limit: 2 });

      assert.equal(getMock.calls.length, 1);
      assert.equal(getMock.calls[0].endpoint, '/artist');
      assert.equal(getMock.calls[0].config?.params?.query, 'baz');
      assert.equal(getMock.calls[0].config?.params?.fmt, 'json');
      assert.equal(getMock.calls[0].config?.params?.limit, '2');
      assert.equal(result.length, 2);
    });

    it('wraps upstream errors with a [MusicBrainz] prefix', async () => {
      getMock.impl = () => {
        throw new Error('nope');
      };

      const mb = new MusicBrainz();
      await assert.rejects(
        () => mb.searchArtist({ query: 'q' }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(
            err.message,
            /^\[MusicBrainz\] Failed to search artists:/
          );
          return true;
        }
      );
    });
  });

  describe('getReleaseGroup', () => {
    it('requests /release/<id> with release-groups include and returns the id', async () => {
      getMock.impl = () => ({ 'release-group': { id: 'rg-1' } });

      const mb = new MusicBrainz();
      const id = await mb.getReleaseGroup({ releaseId: 'rel-1' });

      assert.equal(getMock.calls[0].endpoint, '/release/rel-1');
      assert.equal(getMock.calls[0].config?.params?.inc, 'release-groups');
      assert.equal(getMock.calls[0].config?.params?.fmt, 'json');
      assert.equal(id, 'rg-1');
    });

    it('returns null when the response has no release-group', async () => {
      getMock.impl = () => ({});

      const mb = new MusicBrainz();
      const id = await mb.getReleaseGroup({ releaseId: 'rel-2' });

      assert.equal(id, null);
    });
  });

  describe('getArtistWikipediaExtract', () => {
    const VALID_MBID = '5b11f4ce-a62d-471e-81fc-a69a8278c7da';

    it('rejects invalid MBIDs', async () => {
      const mb = new MusicBrainz();
      await assert.rejects(
        () => mb.getArtistWikipediaExtract({ artistMbid: 'not-a-uuid' }),
        /Invalid MusicBrainz artist ID format/
      );
    });

    // Regression: the MBID validation regex previously rejected uppercase
    // characters, but UUIDs are case-insensitive per RFC 4122.
    it('accepts uppercase MBIDs', async () => {
      const mb = new MusicBrainz();
      const instanceAxios = (
        mb as unknown as {
          axios: { get: (...args: unknown[]) => Promise<unknown> };
        }
      ).axios;
      const axiosGetMock = mock.method(instanceAxios, 'get', async () => ({
        data: {},
      }));

      try {
        const result = await mb.getArtistWikipediaExtract({
          artistMbid: VALID_MBID.toUpperCase(),
        });
        assert.equal(result, null);
        assert.equal(axiosGetMock.mock.calls.length, 1);
        const calledUrl = axiosGetMock.mock.calls[0].arguments[0] as string;
        assert.match(
          calledUrl,
          new RegExp(`/artist/${VALID_MBID.toUpperCase()}/wikipedia-extract$`)
        );
      } finally {
        axiosGetMock.mock.restore();
      }
    });

    it('returns sanitized text content on success', async () => {
      const mb = new MusicBrainz();
      const instanceAxios = (mb as unknown as { axios: { get: typeof fetch } })
        .axios;
      const axiosGetMock = mock.method(
        instanceAxios as unknown as {
          get: (...args: unknown[]) => Promise<unknown>;
        },
        'get',
        async () => ({
          data: {
            wikipediaExtract: {
              title: 'Nirvana',
              url: 'https://en.wikipedia.org/wiki/Nirvana',
              content:
                '  <p>An American <a href="#">rock</a> band.</p><script>alert(1)</script>  ',
            },
          },
        })
      );

      try {
        const result = await mb.getArtistWikipediaExtract({
          artistMbid: VALID_MBID,
        });

        assert.ok(result);
        assert.equal(result.title, 'Nirvana');
        assert.equal(result.url, 'https://en.wikipedia.org/wiki/Nirvana');
        // HTML tags and script payloads must be stripped.
        assert.doesNotMatch(result.content, /<|>/);
        assert.doesNotMatch(result.content, /alert\(/);
        assert.match(result.content, /An American rock band\./);
        assert.equal(axiosGetMock.mock.calls.length, 1);
        const calledUrl = axiosGetMock.mock.calls[0].arguments[0] as string;
        assert.match(
          calledUrl,
          new RegExp(`/artist/${VALID_MBID}/wikipedia-extract$`)
        );
      } finally {
        axiosGetMock.mock.restore();
      }
    });

    it('returns null when there is no wikipedia extract', async () => {
      const mb = new MusicBrainz();
      const instanceAxios = (
        mb as unknown as {
          axios: { get: (...args: unknown[]) => Promise<unknown> };
        }
      ).axios;
      const axiosGetMock = mock.method(instanceAxios, 'get', async () => ({
        data: {},
      }));

      try {
        const result = await mb.getArtistWikipediaExtract({
          artistMbid: VALID_MBID,
        });
        assert.equal(result, null);
      } finally {
        axiosGetMock.mock.restore();
      }
    });

    // Regression: the wikipedia-extract URL was previously built from
    // `.origin` only, which broke self-hosted MusicBrainz instances served
    // from a path prefix (e.g. behind a reverse proxy at `/musicbrainz`).
    it('preserves a configured subpath when building the URL', async () => {
      const mb = new MusicBrainz({
        baseUrl: 'https://example.com/musicbrainz',
        authToken: '',
        maxRPS: 1,
      });
      const instanceAxios = (
        mb as unknown as {
          axios: { get: (...args: unknown[]) => Promise<unknown> };
        }
      ).axios;
      const axiosGetMock = mock.method(instanceAxios, 'get', async () => ({
        data: {},
      }));

      try {
        await mb.getArtistWikipediaExtract({ artistMbid: VALID_MBID });
        const calledUrl = axiosGetMock.mock.calls[0].arguments[0] as string;
        assert.equal(
          calledUrl,
          `https://example.com/musicbrainz/artist/${VALID_MBID}/wikipedia-extract`
        );
      } finally {
        axiosGetMock.mock.restore();
      }
    });

    it('strips a trailing /ws/<n> from the configured base URL', async () => {
      const mb = new MusicBrainz({
        baseUrl: 'https://example.com/musicbrainz/ws/2',
        authToken: '',
        maxRPS: 1,
      });
      const instanceAxios = (
        mb as unknown as {
          axios: { get: (...args: unknown[]) => Promise<unknown> };
        }
      ).axios;
      const axiosGetMock = mock.method(instanceAxios, 'get', async () => ({
        data: {},
      }));

      try {
        await mb.getArtistWikipediaExtract({ artistMbid: VALID_MBID });
        const calledUrl = axiosGetMock.mock.calls[0].arguments[0] as string;
        assert.equal(
          calledUrl,
          `https://example.com/musicbrainz/artist/${VALID_MBID}/wikipedia-extract`
        );
      } finally {
        axiosGetMock.mock.restore();
      }
    });

    // Regression: only http(s) URLs may be used as the base for the
    // wikipedia-extract endpoint (CodeQL SSRF guard). Anything else falls
    // back to the public MusicBrainz host.
    it('falls back to the public host when the configured URL uses a non-http(s) protocol', async () => {
      const mb = new MusicBrainz({
        baseUrl: 'file:///etc/passwd',
        authToken: '',
        maxRPS: 1,
      });
      const instanceAxios = (
        mb as unknown as {
          axios: { get: (...args: unknown[]) => Promise<unknown> };
        }
      ).axios;
      const axiosGetMock = mock.method(instanceAxios, 'get', async () => ({
        data: {},
      }));

      try {
        await mb.getArtistWikipediaExtract({ artistMbid: VALID_MBID });
        const calledUrl = axiosGetMock.mock.calls[0].arguments[0] as string;
        assert.equal(
          calledUrl,
          `https://musicbrainz.org/artist/${VALID_MBID}/wikipedia-extract`
        );
      } finally {
        axiosGetMock.mock.restore();
      }
    });
  });
});

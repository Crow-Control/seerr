---
title: Metadata Providers
description: Configure the metadata providers Seerr uses for TV, anime, and music.
sidebar_position: 8
---

# Metadata Providers

Seerr fetches descriptive metadata (titles, descriptions, posters, release dates,
external IDs, etc.) from a number of third-party providers. The
**Settings → Metadata Providers** page lets administrators pick which provider
is used for each media type and configure the connection details for the
music-specific providers.

A **Test** button at the top and bottom of the page exercises every configured
provider and updates the three status badges (`TheMovieDB`, `TheTVDB`,
`MusicBrainz`). Each badge shows one of:

- **Operational** — the test request succeeded.
- **Not tested** — no test has been run yet in this session.
- **Failed** — the test request errored; a toast describes which provider(s)
  failed so the issue can be resolved without scrolling back up.

## Metadata Provider Selection

This section controls which provider is used for non-music media.

### Series Metadata Provider

Choose between **TheMovieDB** and **TheTVDB** as the source of metadata for TV
series. TheMovieDB is the default and matches the source used for movies, which
keeps IDs and artwork consistent across the UI. TheTVDB tends to have richer
episode-level data for long-running shows.

### Anime Metadata Provider

Choose between **TheMovieDB** and **TheTVDB** for anime entries. Many users
prefer **TheTVDB** here because its anime catalogue is typically more complete
and uses release-aligned numbering.

Selection changes are persisted with the **Save** button at the bottom of the
page.

## Metadata Provider Configuration

This section configures the music metadata providers. Both providers are public
and can be used anonymously; tokens are only required for authenticated or
rate-limited endpoints.

### MusicBrainz

[MusicBrainz](https://musicbrainz.org) is used as the canonical source of music
metadata (artist, release group, and recording identifiers, release dates,
relationships, and the Wikipedia summary shown on artist pages).

| Field                       | Default                       | Description                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Base URL**                | `https://musicbrainz.org`     | The host of the MusicBrainz web service. You can pass either a host-only URL (e.g. `https://musicbrainz.org`) or one that already includes the API version (e.g. `https://musicbrainz.org/ws/2`). Seerr appends `/ws/2` automatically when it is missing. |
| **Max requests per second** | `1`                           | Outbound rate limit. The MusicBrainz public service requires **1 RPS** for anonymous traffic; only raise this if you are pointing at a private mirror or have explicit permission.                                                                       |
| **Auth token (optional)**   | _empty_                       | A MusicBrainz auth token. Only needed for authenticated endpoints or higher rate limits on private deployments.                                                                                                                                         |

Seerr identifies itself to MusicBrainz with the User-Agent
`Seerr/<version>`. This is derived from the running build automatically and is
not user-configurable.

#### Self-hosted mirrors

MusicBrainz can be pointed at a self-hosted mirror by replacing the **Base
URL** value with your mirror's hostname. The same normalization rules apply
(the `/ws/<n>` suffix is optional). If your mirror enforces a different rate
limit, set **Max requests per second** accordingly.

## Saving and Testing

The **Save** buttons persist changes to `config/settings.json`. The **Test**
buttons make one request per provider:

- TMDB / TVDB are tested only when selected as the active provider for one of
  the media types.
- MusicBrainz is tested with a minimal release-group search.

If any test fails, a toast is shown for that provider and its status badge is
updated; the other providers' results are independent.

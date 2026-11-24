/**
 * AniList GraphQL adapter (`POST https://graphql.anilist.co`) with sliding-window rate limiting and 429 handling.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { HttpError, fetchJson } from './http.js';

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
export const DEFAULT_ANILIST_LIMIT = 30;
export const DEFAULT_ANILIST_WINDOW_MS = 60000;
const DEFAULT_429_BACKOFF_MS = 2000;

export const ANILIST_SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      title {
        userPreferred
        english
        romaji
        native
      }
      coverImage {
        extraLarge
        large
        medium
      }
      seasonYear
      startDate {
        year
      }
      genres
      studios {
        edges {
          isMain
          node {
            name
          }
        }
      }
      staff(perPage: 10) {
        edges {
          role
          node {
            name {
              full
            }
          }
        }
      }
    }
  }
}
`;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a sliding-window rate-limited queue.
 * @param {{ maxRequests?: number, windowMs?: number, now?: () => number, sleep?: (ms: number) => Promise<void> }} [options]
 */
export function createRateQueue(options = {}) {
  const maxRequests = options.maxRequests ?? DEFAULT_ANILIST_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_ANILIST_WINDOW_MS;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || defaultSleep;

  /** @type {number[]} */
  let timestamps = [];
  let chain = Promise.resolve();

  function enqueue(taskFn) {
    const run = chain.then(async () => {
      const currentTime = now();
      timestamps = timestamps.filter((t) => currentTime - t < windowMs);

      if (timestamps.length >= maxRequests) {
        const oldest = timestamps[0];
        const waitMs = Math.max(1, windowMs - (currentTime - oldest));
        await sleep(waitMs);
        const afterWait = now();
        timestamps = timestamps.filter((t) => afterWait - t < windowMs);
      }

      timestamps.push(now());
      return taskFn();
    });

    chain = run.catch((err) => ({ queueError: err }));
    return run;
  }

  return { enqueue };
}

function pickTitle(titleObj) {
  if (!titleObj || typeof titleObj !== 'object') {
    return '';
  }
  return titleObj.userPreferred || titleObj.english || titleObj.romaji || titleObj.native || '';
}

function pickStudio(studiosObj) {
  const edges = studiosObj?.edges;
  if (!Array.isArray(edges) || edges.length === 0) {
    return '';
  }
  const mainEdge = edges.find((edge) => edge?.isMain && edge?.node?.name);
  if (mainEdge) {
    return mainEdge.node.name;
  }
  const firstEdge = edges.find((edge) => edge?.node?.name);
  return firstEdge ? firstEdge.node.name : '';
}

function pickStaffSummary(staffObj) {
  const edges = staffObj?.edges;
  if (!Array.isArray(edges) || edges.length === 0) {
    return { director: '', soundtrack: '', starring: '' };
  }

  const directors = [];
  const music = [];
  const creators = [];

  for (const edge of edges) {
    const name = edge?.node?.name?.full;
    const role = String(edge?.role || '');
    if (!name) {
      continue;
    }
    if (/director/i.test(role) && !/assistant|sound/i.test(role)) {
      directors.push(name);
    } else if (/music|composer|sound/i.test(role)) {
      music.push(name);
    } else if (/original creator|series composition/i.test(role)) {
      creators.push(name);
    }
  }

  return {
    director: directors.slice(0, 2).join(', '),
    soundtrack: music.slice(0, 2).join(', '),
    starring: creators.slice(0, 3).join(', ')
  };
}

/**
 * Normalizes an AniList Media object into CANON's work draft structure.
 * @param {Record<string, any>} media
 */
export function normalizeAniListMedia(media) {
  const staff = pickStaffSummary(media?.staff);
  const year = media?.seasonYear || media?.startDate?.year || new Date().getUTCFullYear();
  const coverUrl = media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || null;

  return {
    id: `anilist:${media.id}`,
    type: 'anime',
    title: pickTitle(media?.title),
    year: Number(year),
    genre: Array.isArray(media?.genres) ? media.genres.join(', ') : '',
    studio: pickStudio(media?.studios),
    director: staff.director,
    soundtrack: staff.soundtrack,
    starring: staff.starring,
    coverUrl,
    cover: null,
    palette: [...DEFAULT_PALETTE],
    detailsLoaded: true
  };
}

/**
 * Searches anime on AniList via GraphQL POST, respecting queue limits and HTTP 429 Retry-After.
 * @param {string} query
 * @param {{
 *   perPage?: number,
 *   signal?: AbortSignal,
 *   fetchFn?: typeof fetch,
 *   queue?: ReturnType<typeof createRateQueue>,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number
 * }} [options]
 */
export async function searchAniList(query, options = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return [];
  }

  const queue = options.queue || defaultAniListQueue;
  const sleep = options.sleep || defaultSleep;
  const perPage = options.perPage ?? 8;

  const executeRequest = () =>
    queue.enqueue(() =>
      fetchJson(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          query: ANILIST_SEARCH_QUERY,
          variables: {
            search: trimmed,
            page: 1,
            perPage
          }
        }),
        signal: options.signal,
        fetchFn: options.fetchFn,
        now: options.now
      })
    );

  let payload;
  try {
    payload = await executeRequest();
  } catch (err) {
    if (err instanceof HttpError && err.kind === 'rate_limit') {
      const waitMs = err.retryAfterMs > 0 ? Math.min(err.retryAfterMs, 65000) : DEFAULT_429_BACKOFF_MS;
      await sleep(waitMs);
      payload = await executeRequest();
    } else {
      throw err;
    }
  }

  const mediaList = payload?.data?.Page?.media;
  if (!Array.isArray(mediaList)) {
    return [];
  }
  return mediaList.map(normalizeAniListMedia);
}

const defaultAniListQueue = createRateQueue();

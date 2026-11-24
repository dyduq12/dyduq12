/**
 * RAWG Video Games Database API adapter with aggressive caching and CORS TypeError fallback.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { getApiKey } from '../ui/settings.js';
import { HttpError, fetchJson } from './http.js';

export const RAWG_BASE_URL = 'https://api.rawg.io/api';
export const RAWG_NETWORK_BLOCKED_CODE = 'bloqueio-de-rede';

function parseYear(released) {
  if (typeof released !== 'string' || released.length < 4) {
    return new Date().getUTCFullYear();
  }
  const year = Number.parseInt(released.slice(0, 4), 10);
  return Number.isInteger(year) ? year : new Date().getUTCFullYear();
}

async function resolveRawgKey(options) {
  if (typeof options.apiKey === 'string') {
    const k = options.apiKey.trim();
    if (k) {
      return k;
    }
  }
  if (options.db) {
    const stored = await getApiKey(options.db, 'rawg');
    if (stored) {
      return stored;
    }
  }
  throw new HttpError('missing_key', 'Chave da API RAWG ausente. Configure-a em Configurações ou use entrada manual.');
}

function createNetworkBlockedError(cause) {
  const err = new HttpError(
    RAWG_NETWORK_BLOCKED_CODE,
    'Não foi possível acessar a RAWG (bloqueio CORS ou rede). Use o preenchimento manual.',
    { cause }
  );
  err.code = RAWG_NETWORK_BLOCKED_CODE;
  return err;
}

/**
 * Normalizes a RAWG search or detail game payload into CANON's work draft structure.
 * @param {Record<string, any>} game
 * @param {boolean} [detailsLoaded]
 */
export function normalizeRawgGame(game, detailsLoaded = false) {
  const genres = Array.isArray(game?.genres)
    ? game.genres.map((g) => g?.name).filter(Boolean).join(', ')
    : '';

  const developers = Array.isArray(game?.developers)
    ? game.developers.map((d) => d?.name).filter(Boolean).slice(0, 2).join(', ')
    : '';

  return {
    id: `rawg:${game.id}`,
    rawgId: game.id,
    type: 'game',
    title: String(game?.name || ''),
    year: parseYear(game?.released),
    genre: genres,
    studio: developers,
    director: '',
    soundtrack: '',
    starring: '',
    coverUrl: typeof game?.background_image === 'string' && game.background_image ? game.background_image : null,
    cover: null,
    palette: [...DEFAULT_PALETTE],
    detailsLoaded
  };
}

/**
 * Searches games on RAWG. On network/CORS TypeError, falls back to cached results (even stale) before raising 'bloqueio-de-rede'.
 * @param {string} query
 * @param {{ apiKey?: string, db?: unknown, cache?: { get: Function, set: Function }, cacheKey?: string, signal?: AbortSignal, fetchFn?: typeof fetch }} [options]
 */
export async function searchRawg(query, options = {}) {
  const apiKey = await resolveRawgKey(options);
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return { results: [], fromCache: false, stale: false };
  }

  const cacheKey = options.cacheKey || `game:${trimmed}`;
  const url = `${RAWG_BASE_URL}/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(trimmed)}&page_size=8`;

  try {
    const payload = await fetchJson(url, {
      signal: options.signal,
      fetchFn: options.fetchFn
    });
    const list = Array.isArray(payload?.results) ? payload.results : [];
    const normalized = list.map((item) => normalizeRawgGame(item, false));
    if (options.cache) {
      await options.cache.set('rawg', cacheKey, normalized);
    }
    return { results: normalized, fromCache: false, stale: false };
  } catch (err) {
    if (err instanceof HttpError && err.kind === 'network') {
      if (options.cache) {
        const fallback = await options.cache.get('rawg', cacheKey, { allowExpired: true });
        if (fallback.hit && Array.isArray(fallback.value)) {
          return { results: fallback.value, fromCache: true, stale: fallback.stale };
        }
      }
      throw createNetworkBlockedError(err);
    }
    throw err;
  }
}

/**
 * Fetches full RAWG game details (developers, genres, year). Falls back to cache on CORS/network TypeError.
 * @param {string | number} rawgId
 * @param {{ apiKey?: string, db?: unknown, cache?: { get: Function, set: Function }, signal?: AbortSignal, fetchFn?: typeof fetch }} [options]
 */
export async function fetchRawgDetails(rawgId, options = {}) {
  const apiKey = await resolveRawgKey(options);
  const numericId = String(rawgId).replace(/^rawg:/, '');
  const cacheKey = `details:${numericId}`;

  if (options.cache) {
    const cached = await options.cache.get('rawg', cacheKey);
    if (cached.hit && cached.value) {
      return cached.value;
    }
  }

  const url = `${RAWG_BASE_URL}/games/${encodeURIComponent(numericId)}?key=${encodeURIComponent(apiKey)}`;

  try {
    const payload = await fetchJson(url, {
      signal: options.signal,
      fetchFn: options.fetchFn
    });
    const normalized = normalizeRawgGame(payload, true);
    if (options.cache) {
      await options.cache.set('rawg', cacheKey, normalized);
    }
    return normalized;
  } catch (err) {
    if (err instanceof HttpError && err.kind === 'network') {
      if (options.cache) {
        const stale = await options.cache.get('rawg', cacheKey, { allowExpired: true });
        if (stale.hit && stale.value) {
          return stale.value;
        }
      }
      throw createNetworkBlockedError(err);
    }
    throw err;
  }
}

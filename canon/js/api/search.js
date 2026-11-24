/**
 * Unified search orchestrator by media type with debounce, cache, AbortController cancellation, and safe UI errors.
 */

import { searchAniList } from './anilist.js';
import { createApiCache } from './cache.js';
import { HttpError } from './http.js';
import { fetchRawgDetails, searchRawg } from './rawg.js';
import { fetchTmdbDetails, searchTmdb } from './tmdb.js';

export const DEFAULT_DEBOUNCE_MS = 450;

function providerForType(type) {
  if (type === 'anime') {
    return 'anilist';
  }
  if (type === 'movie' || type === 'series') {
    return 'tmdb';
  }
  if (type === 'game') {
    return 'rawg';
  }
  return null;
}

function classifyUiError(err) {
  if (err instanceof HttpError) {
    return {
      code: err.code || err.kind,
      message: err.message
    };
  }
  return {
    code: 'unknown',
    message: err?.message || 'Erro inesperado ao consultar metadados. Use o preenchimento manual.'
  };
}

/**
 * Creates the search orchestrator for CANON.
 * Never throws to callers; always returns `{ ok, results, error, fromCache, stale, aborted }`.
 * @param {{
 *   db?: unknown,
 *   cache?: ReturnType<typeof createApiCache>,
 *   fetchFn?: typeof fetch,
 *   debounceMs?: number,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   anilistQueue?: unknown
 * }} [deps]
 */
export function createSearchService(deps = {}) {
  const cache = deps.cache || (deps.db ? createApiCache(deps.db, { now: deps.now }) : null);
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let pendingTimer = null;
  /** @type {((value: any) => void) | null} */
  let pendingResolve = null;
  /** @type {AbortController | null} */
  let activeController = null;

  function cancelPending() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (pendingResolve) {
      pendingResolve({
        ok: false,
        aborted: true,
        results: [],
        fromCache: false,
        stale: false,
        error: null
      });
      pendingResolve = null;
    }
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  async function runImmediate(query, type, options = {}) {
    const trimmed = String(query || '').trim();
    const provider = providerForType(type);

    if (!provider) {
      return {
        ok: false,
        aborted: false,
        results: [],
        fromCache: false,
        stale: false,
        error: { code: 'invalid_type', message: `Tipo de mídia inválido: "${type}".` }
      };
    }

    if (!trimmed) {
      return {
        ok: true,
        aborted: false,
        results: [],
        fromCache: false,
        stale: false,
        error: null
      };
    }

    const cacheKey = `${type}:${trimmed}`;
    if (cache && !options.bypassCache) {
      const cached = await cache.get(provider, cacheKey);
      if (cached.hit && Array.isArray(cached.value)) {
        return {
          ok: true,
          aborted: false,
          results: cached.value,
          fromCache: true,
          stale: false,
          error: null
        };
      }
    }

    const controller = new AbortController();
    activeController = controller;

    try {
      let results = [];
      let fromCache = false;
      let stale = false;

      if (provider === 'anilist') {
        results = await searchAniList(trimmed, {
          signal: controller.signal,
          fetchFn: deps.fetchFn,
          queue: deps.anilistQueue,
          sleep: deps.sleep,
          now: deps.now
        });
      } else if (provider === 'tmdb') {
        results = await searchTmdb(trimmed, type, {
          db: deps.db,
          apiKey: options.apiKey,
          signal: controller.signal,
          fetchFn: deps.fetchFn
        });
      } else if (provider === 'rawg') {
        const rawgOut = await searchRawg(trimmed, {
          db: deps.db,
          apiKey: options.apiKey,
          cache,
          cacheKey,
          signal: controller.signal,
          fetchFn: deps.fetchFn
        });
        results = rawgOut.results;
        fromCache = rawgOut.fromCache;
        stale = rawgOut.stale;
      }

      if (cache && !fromCache) {
        await cache.set(provider, cacheKey, results);
      }

      return {
        ok: true,
        aborted: false,
        results,
        fromCache,
        stale,
        error: null
      };
    } catch (err) {
      if (err instanceof HttpError && err.kind === 'aborted') {
        return {
          ok: false,
          aborted: true,
          results: [],
          fromCache: false,
          stale: false,
          error: null
        };
      }
      console.warn('[search] Falha controlada na busca:', {
        provider,
        type,
        kind: err?.kind || err?.code,
        message: err?.message
      });
      return {
        ok: false,
        aborted: false,
        results: [],
        fromCache: false,
        stale: false,
        error: classifyUiError(err)
      };
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  /**
   * Executes a debounced search (canceling previous timers and in-flight HTTP calls).
   * @param {string} query
   * @param {'game' | 'movie' | 'series' | 'anime'} type
   * @param {{ immediate?: boolean, bypassCache?: boolean, apiKey?: string }} [options]
   */
  function search(query, type, options = {}) {
    cancelPending();

    if (options.immediate || debounceMs <= 0) {
      return runImmediate(query, type, options);
    }

    return new Promise((resolve) => {
      pendingResolve = resolve;
      pendingTimer = setTimeout(async () => {
        pendingTimer = null;
        pendingResolve = null;
        const output = await runImmediate(query, type, options);
        resolve(output);
      }, debounceMs);
    });
  }

  /**
   * Hydrates details/credits for a selected result without failing the selection flow.
   * @param {Record<string, any>} item
   * @param {{ apiKey?: string }} [options]
   */
  async function resolveResultDetails(item, options = {}) {
    if (!item || typeof item !== 'object') {
      return { ok: false, item: null, warning: 'Resultado inválido.' };
    }
    if (item.detailsLoaded) {
      return { ok: true, item, warning: null };
    }

    const provider = providerForType(item.type);
    const cacheKey = `details:${item.id}`;
    if (cache && provider) {
      const cached = await cache.get(provider, cacheKey);
      if (cached.hit && cached.value) {
        return { ok: true, item: cached.value, warning: null };
      }
    }

    try {
      let detailed = item;
      if (provider === 'tmdb') {
        detailed = await fetchTmdbDetails(item.id, item.type, {
          db: deps.db,
          apiKey: options.apiKey,
          fetchFn: deps.fetchFn
        });
      } else if (provider === 'rawg') {
        detailed = await fetchRawgDetails(item.id, {
          db: deps.db,
          apiKey: options.apiKey,
          cache,
          fetchFn: deps.fetchFn
        });
      }

      if (cache && provider) {
        await cache.set(provider, cacheKey, detailed);
      }
      return { ok: true, item: detailed, warning: null };
    } catch (err) {
      console.warn('[search.resolveResultDetails] Falha ao obter detalhes extras; mantendo dados básicos:', {
        id: item.id,
        message: err?.message
      });
      return {
        ok: true,
        item,
        warning: err?.message || 'Não foi possível carregar créditos completos; preencha manualmente se desejar.'
      };
    }
  }

  return {
    search,
    resolveResultDetails,
    cancel: cancelPending
  };
}

/**
 * IndexedDB API response cache (`apiCache` store) with per-provider TTL and injectable clock.
 */

import { STORES } from '../core/db.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const PROVIDER_TTLS_MS = Object.freeze({
  anilist: DAY_MS,
  tmdb: DAY_MS,
  rawg: 7 * DAY_MS
});

/**
 * Normalizes a query string and produces a deterministic `provider:query` cache key.
 * @param {string} provider
 * @param {string} query
 * @returns {string}
 */
export function buildCacheKey(provider, query) {
  const cleanProvider = String(provider || '').trim().toLowerCase();
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `${cleanProvider}:${normalizedQuery}`;
}

/**
 * Creates a cache manager backed by `db.js` (`apiCache` object store).
 * @param {ReturnType<import('../core/db.js').createDatabase>} db
 * @param {{ now?: () => number, ttls?: Record<string, number> }} [options]
 */
export function createApiCache(db, options = {}) {
  const now = options.now || (() => Date.now());
  const ttls = { ...PROVIDER_TTLS_MS, ...(options.ttls || {}) };

  function resolveTtl(provider, overrideTtlMs) {
    if (typeof overrideTtlMs === 'number' && overrideTtlMs > 0) {
      return overrideTtlMs;
    }
    return ttls[String(provider || '').toLowerCase()] ?? DAY_MS;
  }

  /**
   * Reads a cached entry. By default returns null if expired; pass `allowExpired: true` for offline/CORS fallback.
   * @param {string} provider
   * @param {string} query
   * @param {{ allowExpired?: boolean }} [opts]
   * @returns {Promise<{ hit: boolean, stale: boolean, value: unknown }>}
   */
  async function get(provider, query, opts = {}) {
    const key = buildCacheKey(provider, query);
    try {
      const entry = await db.get(STORES.API_CACHE, key);
      if (!entry) {
        return { hit: false, stale: false, value: null };
      }
      const expired = typeof entry.expiresAt === 'number' && now() > entry.expiresAt;
      if (expired && !opts.allowExpired) {
        return { hit: false, stale: true, value: null };
      }
      return { hit: true, stale: expired, value: entry.value };
    } catch (err) {
      console.warn('[cache.get] Falha ao ler cache da API:', { key, message: err?.message });
      return { hit: false, stale: false, value: null };
    }
  }

  /**
   * Writes an API response payload to the cache with provider TTL.
   * @param {string} provider
   * @param {string} query
   * @param {unknown} value
   * @param {number} [ttlMs]
   * @returns {Promise<void>}
   */
  async function set(provider, query, value, ttlMs) {
    const key = buildCacheKey(provider, query);
    const createdAt = now();
    const expiresAt = createdAt + resolveTtl(provider, ttlMs);
    try {
      await db.put(STORES.API_CACHE, {
        key,
        provider: String(provider || '').toLowerCase(),
        query: String(query || ''),
        value,
        createdAt,
        expiresAt
      });
    } catch (err) {
      console.warn('[cache.set] Falha ao gravar cache da API:', { key, message: err?.message });
    }
  }

  /**
   * Invalidates a specific cached query.
   * @param {string} provider
   * @param {string} query
   */
  async function invalidate(provider, query) {
    const key = buildCacheKey(provider, query);
    try {
      await db.delete(STORES.API_CACHE, key);
    } catch (err) {
      console.warn('[cache.invalidate] Falha ao invalidar cache:', { key, message: err?.message });
    }
  }

  /**
   * Removes all expired entries from `apiCache` and returns the count removed.
   * @returns {Promise<number>}
   */
  async function pruneExpired() {
    try {
      const entries = await db.getAll(STORES.API_CACHE);
      const currentTime = now();
      let removed = 0;
      for (const entry of entries) {
        if (entry && typeof entry.expiresAt === 'number' && currentTime > entry.expiresAt) {
          await db.delete(STORES.API_CACHE, entry.key);
          removed += 1;
        }
      }
      return removed;
    } catch (err) {
      console.warn('[cache.pruneExpired] Falha ao limpar entradas expiradas:', { message: err?.message });
      return 0;
    }
  }

  return {
    get,
    set,
    invalidate,
    pruneExpired
  };
}

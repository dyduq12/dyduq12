import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCacheKey, createApiCache } from '../js/api/cache.js';
import { createDatabase } from '../js/core/db.js';

describe('cache.js — chaves, TTL por provedor, expiração e fallback', () => {
  it('normaliza chaves no formato provider:query-normalizada', () => {
    assert.equal(buildCacheKey('AniList', '  Cowboy   Bebop '), 'anilist:cowboy bebop');
    assert.equal(buildCacheKey('RAWG', 'Hollow   Knight'), 'rawg:hollow knight');
  });

  it('armazena e recupera antes do TTL e expira após TTL usando relógio injetável', async () => {
    let clock = 1000;
    const db = createDatabase(undefined);
    const cache = createApiCache(db, {
      now: () => clock,
      ttls: { anilist: 5000, rawg: 50000 }
    });

    await cache.set('anilist', 'anime:Akira', [{ id: 'anilist:47', title: 'Akira' }]);

    const hitBefore = await cache.get('anilist', 'anime:akira');
    assert.equal(hitBefore.hit, true);
    assert.equal(hitBefore.stale, false);
    assert.equal(hitBefore.value[0].title, 'Akira');

    clock = 6500;
    const expiredMiss = await cache.get('anilist', 'anime:akira');
    assert.equal(expiredMiss.hit, false);
    assert.equal(expiredMiss.stale, true);

    const allowedStale = await cache.get('anilist', 'anime:akira', { allowExpired: true });
    assert.equal(allowedStale.hit, true);
    assert.equal(allowedStale.stale, true);
    assert.equal(allowedStale.value[0].id, 'anilist:47');
  });

  it('invalida item específico e remove apenas entradas expiradas em pruneExpired', async () => {
    let clock = 0;
    const db = createDatabase(undefined);
    const cache = createApiCache(db, {
      now: () => clock,
      ttls: { anilist: 1000, rawg: 10000 }
    });

    await cache.set('anilist', 'anime:curto', ['a']);
    await cache.set('rawg', 'game:longo', ['b']);
    await cache.set('tmdb', 'movie:apagar', ['c']);

    await cache.invalidate('tmdb', 'movie:apagar');
    const afterInvalidate = await cache.get('tmdb', 'movie:apagar');
    assert.equal(afterInvalidate.hit, false);

    clock = 2000;
    const removedCount = await cache.pruneExpired();
    assert.equal(removedCount, 1);

    const anilistAfterPrune = await cache.get('anilist', 'anime:curto', { allowExpired: true });
    assert.equal(anilistAfterPrune.hit, false);

    const rawgAfterPrune = await cache.get('rawg', 'game:longo');
    assert.equal(rawgAfterPrune.hit, true);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRateQueue, searchAniList } from '../js/api/anilist.js';
import { createApiCache } from '../js/api/cache.js';
import { HttpError, fetchJson } from '../js/api/http.js';
import { RAWG_NETWORK_BLOCKED_CODE, fetchRawgDetails, searchRawg } from '../js/api/rawg.js';
import { createSearchService } from '../js/api/search.js';
import { fetchTmdbDetails, searchTmdb } from '../js/api/tmdb.js';
import { createDatabase } from '../js/core/db.js';
import { saveApiKeys } from '../js/ui/settings.js';

describe('http.js — erros tipados e Retry-After', () => {
  it('classifica 401, 404, 429 com Retry-After, 500 e TypeError de rede', async () => {
    await assert.rejects(
      () =>
        fetchJson('https://example.test/auth', {
          fetchFn: async () => new Response('{}', { status: 401 })
        }),
      (err) => err instanceof HttpError && err.kind === 'auth'
    );

    await assert.rejects(
      () =>
        fetchJson('https://example.test/missing', {
          fetchFn: async () => new Response('{}', { status: 404 })
        }),
      (err) => err instanceof HttpError && err.kind === 'not_found'
    );

    await assert.rejects(
      () =>
        fetchJson('https://example.test/limit', {
          fetchFn: async () => new Response('{}', { status: 429, headers: { 'Retry-After': '3' } })
        }),
      (err) => err instanceof HttpError && err.kind === 'rate_limit' && err.retryAfterMs === 3000
    );

    await assert.rejects(
      () =>
        fetchJson('https://example.test/fail', {
          fetchFn: async () => new Response('{}', { status: 503 })
        }),
      (err) => err instanceof HttpError && err.kind === 'server'
    );

    await assert.rejects(
      () =>
        fetchJson('https://example.test/cors', {
          fetchFn: async () => {
            throw new TypeError('Failed to fetch');
          }
        }),
      (err) => err instanceof HttpError && err.kind === 'network'
    );
  });
});

describe('anilist.js — GraphQL POST, fila e tratamento de HTTP 429', () => {
  it('normaliza resultado GraphQL sem chave e respeita fila deslizante + 429 Retry-After', async () => {
    let clock = 1000;
    const sleeps = [];
    const queue = createRateQueue({
      maxRequests: 2,
      windowMs: 60000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      }
    });

    let calls = 0;
    const mockFetch = async (url, init) => {
      calls += 1;
      assert.equal(url, 'https://graphql.anilist.co');
      assert.equal(init.method, 'POST');
      if (calls === 1) {
        return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
      }
      return new Response(
        JSON.stringify({
          data: {
            Page: {
              media: [
                {
                  id: 16498,
                  title: { userPreferred: 'Shingeki no Kyojin' },
                  coverImage: { extraLarge: 'https://cdn.example/cover.jpg' },
                  seasonYear: 2013,
                  genres: ['Action', 'Drama'],
                  studios: { edges: [{ isMain: true, node: { name: 'WIT STUDIO' } }] },
                  staff: {
                    edges: [
                      { role: 'Director', node: { name: { full: 'Tetsuro Araki' } } },
                      { role: 'Music', node: { name: { full: 'Hiroyuki Sawano' } } }
                    ]
                  }
                }
              ]
            }
          }
        }),
        { status: 200 }
      );
    };

    const res1 = await searchAniList('Shingeki', {
      fetchFn: mockFetch,
      queue,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      }
    });
    assert.equal(res1.length, 1);
    assert.equal(res1[0].id, 'anilist:16498');
    assert.equal(res1[0].studio, 'WIT STUDIO');
    assert.equal(res1[0].director, 'Tetsuro Araki');
    assert.equal(res1[0].soundtrack, 'Hiroyuki Sawano');
    assert.ok(sleeps.includes(1000));

    // A 3ª requisição na janela de 2 deve aguardar o restante dos 60s
    await searchAniList('Frieren', { fetchFn: mockFetch, queue, now: () => clock });
    assert.ok(sleeps.some((ms) => ms > 50000));
  });
});

describe('tmdb.js — chave no IndexedDB, busca e créditos', () => {
  it('recusa sem fazer rede quando a chave TMDB está ausente no IndexedDB', async () => {
    const db = createDatabase(undefined);
    let fetched = false;

    await assert.rejects(
      () =>
        searchTmdb('Matrix', 'movie', {
          db,
          fetchFn: async () => {
            fetched = true;
            return new Response('{}', { status: 200 });
          }
        }),
      (err) => err instanceof HttpError && err.kind === 'missing_key'
    );
    assert.equal(fetched, false);
  });

  it('busca filme/série e normaliza créditos com chave lida do IndexedDB', async () => {
    const db = createDatabase(undefined);
    await saveApiKeys(db, { tmdb: 'tmdb-demo-key' });

    const mockFetch = async (url) => {
      assert.ok(url.includes('api_key=tmdb-demo-key'));
      if (url.includes('/search/movie')) {
        return new Response(
          JSON.stringify({
            results: [
              { id: 603, title: 'The Matrix', release_date: '1999-03-31', poster_path: '/matrix.jpg' }
            ]
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          id: 603,
          title: 'The Matrix',
          release_date: '1999-03-31',
          poster_path: '/matrix.jpg',
          genres: [{ name: 'Sci-Fi' }],
          production_companies: [{ name: 'Warner Bros.' }],
          credits: {
            crew: [
              { job: 'Director', name: 'Lana Wachowski' },
              { job: 'Original Music Composer', name: 'Don Davis' }
            ],
            cast: [{ name: 'Keanu Reeves' }, { name: 'Carrie-Anne Moss' }]
          }
        }),
        { status: 200 }
      );
    };

    const items = await searchTmdb('Matrix', 'movie', { db, fetchFn: mockFetch });
    assert.equal(items.length, 1);
    assert.equal(items[0].coverUrl, 'https://image.tmdb.org/t/p/w500/matrix.jpg');

    const details = await fetchTmdbDetails('tmdb:603', 'movie', { db, fetchFn: mockFetch });
    assert.equal(details.director, 'Lana Wachowski');
    assert.equal(details.soundtrack, 'Don Davis');
    assert.equal(details.starring, 'Keanu Reeves, Carrie-Anne Moss');
    assert.equal(details.studio, 'Warner Bros.');

    const seriesFetch = async (url) => {
      if (url.includes('/search/tv')) {
        return new Response(
          JSON.stringify({ results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/bb.jpg' }] }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          id: 1396,
          name: 'Breaking Bad',
          first_air_date: '2008-01-20',
          poster_path: '/bb.jpg',
          genres: [{ name: 'Drama' }],
          networks: [{ name: 'AMC' }],
          created_by: [{ name: 'Vince Gilligan' }],
          credits: { crew: [], cast: [{ name: 'Bryan Cranston' }] }
        }),
        { status: 200 }
      );
    };

    const seriesItems = await searchTmdb('Breaking Bad', 'series', { db, fetchFn: seriesFetch });
    assert.equal(seriesItems[0].type, 'series');
    const seriesDetails = await fetchTmdbDetails('tmdb:1396', 'series', { db, fetchFn: seriesFetch });
    assert.equal(seriesDetails.director, 'Vince Gilligan');
    assert.equal(seriesDetails.studio, 'AMC');
  });
});

describe('rawg.js & search.js — cache hit, TypeError fallback e orquestração', () => {
  it('RAWG cai para cache em TypeError e retorna erro tipado bloqueio-de-rede sem cache', async () => {
    const db = createDatabase(undefined);
    await saveApiKeys(db, { rawg: 'rawg-demo-key' });
    const cache = createApiCache(db);

    const corsFailFetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await assert.rejects(
      () => searchRawg('Celeste', { db, cache, fetchFn: corsFailFetch }),
      (err) => err instanceof HttpError && err.kind === RAWG_NETWORK_BLOCKED_CODE
    );

    await cache.set('rawg', 'game:Celeste', [{ id: 'rawg:50738', type: 'game', title: 'Celeste', year: 2018 }]);
    const fallbackRes = await searchRawg('Celeste', { db, cache, fetchFn: corsFailFetch });
    assert.equal(fallbackRes.fromCache, true);
    assert.equal(fallbackRes.results[0].title, 'Celeste');

    const detailsOkFetch = async () =>
      new Response(
        JSON.stringify({
          id: 50738,
          name: 'Celeste',
          released: '2018-01-25',
          background_image: 'https://media.rawg.io/celeste.jpg',
          genres: [{ name: 'Indie' }, { name: 'Platformer' }],
          developers: [{ name: 'Maddy Makes Games' }]
        }),
        { status: 200 }
      );

    const details = await fetchRawgDetails('rawg:50738', { db, cache, fetchFn: detailsOkFetch });
    assert.equal(details.studio, 'Maddy Makes Games');
    assert.equal(details.genre, 'Indie, Platformer');
  });

  it('search.js evita segunda requisição idêntica via cache e nunca lança exceção na UI', async () => {
    const db = createDatabase(undefined);
    const cache = createApiCache(db);
    let networkCalls = 0;

    const searchService = createSearchService({
      db,
      cache,
      debounceMs: 0,
      fetchFn: async () => {
        networkCalls += 1;
        return new Response(
          JSON.stringify({
            data: {
              Page: {
                media: [{ id: 1, title: { romaji: 'Cowboy Bebop' }, seasonYear: 1998, genres: ['Sci-Fi'] }]
              }
            }
          }),
          { status: 200 }
        );
      }
    });

    const first = await searchService.search('Cowboy Bebop', 'anime');
    assert.equal(first.ok, true);
    assert.equal(first.fromCache, false);
    assert.equal(networkCalls, 1);

    const second = await searchService.search('  cowboy   bebop ', 'anime');
    assert.equal(second.ok, true);
    assert.equal(second.fromCache, true);
    assert.equal(networkCalls, 1);

    // Sem chave TMDB, retorna objeto controlado { ok: false, error } sem lançar exceção
    const missingKeyRes = await searchService.search('Dune', 'movie');
    assert.equal(missingKeyRes.ok, false);
    assert.equal(missingKeyRes.error.code, 'missing_key');

    // Debounce cancela a primeira busca pendente quando uma segunda é disparada
    const debouncedService = createSearchService({
      db,
      cache,
      debounceMs: 40,
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: { Page: { media: [{ id: 2, title: { romaji: 'Monster' }, seasonYear: 2004, genres: ['Mystery'] }] } }
          }),
          { status: 200 }
        )
    });
    const firstPromise = debouncedService.search('Mons', 'anime');
    const secondPromise = debouncedService.search('Monster', 'anime');
    const [firstOut, secondOut] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(firstOut.aborted, true);
    assert.equal(secondOut.ok, true);
    assert.equal(secondOut.results[0].title, 'Monster');
  });
});

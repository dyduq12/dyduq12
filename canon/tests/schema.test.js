import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SCHEMA_VERSION,
  createWork,
  isValidPaletteColor,
  isValidScore,
  isValidWorkId,
  mergeWorks,
  normalizeCatalog,
  normalizeWork,
  validateCatalog,
  validateWork
} from '../js/core/schema.js';
import { createDatabase } from '../js/core/db.js';
import { createStore } from '../js/core/store.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('schema.js — validação, migração e mesclagem', () => {
  it('cria e valida uma obra padrão válida', () => {
    const work = createWork({
      title: 'Obra Exemplo',
      type: 'anime',
      year: 2024,
      scores: { geral: 8.5 }
    });

    const result = validateWork(work);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(isValidWorkId(work.id), true);
  });

  it('rejeita campos obrigatórios ausentes com erros específicos', () => {
    const invalid = createWork({ title: '' });
    delete invalid.year;
    delete invalid.status;

    const result = validateWork(invalid);
    assert.equal(result.valid, false);
    const fields = result.errors.map((e) => e.field);
    assert.ok(fields.includes('title'));
    assert.ok(fields.includes('year'));
    assert.ok(fields.includes('status'));
  });

  it('rejeita tipo inválido', () => {
    const work = createWork({ title: 'Teste', type: 'podcast' });
    const result = validateWork(work);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === 'type'));
  });

  it('rejeita notas fora do intervalo [0, 10] ou fora do passo 0,5', () => {
    assert.equal(isValidScore(0), true);
    assert.equal(isValidScore(9.5), true);
    assert.equal(isValidScore(10), true);
    assert.equal(isValidScore(-0.5), false);
    assert.equal(isValidScore(10.5), false);
    assert.equal(isValidScore(7.3), false);

    const work = createWork({
      title: 'Notas Inválidas',
      scores: { geral: 7.3, historia: 11, trilha: -1 }
    });
    const result = validateWork(work);
    assert.equal(result.valid, false);
    const fields = result.errors.map((e) => e.field);
    assert.ok(fields.includes('scores.geral'));
    assert.ok(fields.includes('scores.historia'));
    assert.ok(fields.includes('scores.trilha'));
  });

  it('valida formato de id (provider:id e manual:<uuid>)', () => {
    assert.equal(isValidWorkId('anilist:12345'), true);
    assert.equal(isValidWorkId('tmdb:movie-99'), true);
    assert.equal(isValidWorkId('manual:550e8400-e29b-41d4-a716-446655440000'), true);

    assert.equal(isValidWorkId('sem-prefixo'), false);
    assert.equal(isValidWorkId('manual:nao-e-uuid'), false);
    assert.equal(isValidWorkId('anilist:'), false);

    const work = createWork({ id: 'invalido', title: 'Teste ID' });
    const result = validateWork(work);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === 'id'));
  });

  it('rejeita cores hex puras extremas na paleta', () => {
    const pureLight = '#' + 'f'.repeat(6);
    const pureDark = '#' + '0'.repeat(6);

    assert.equal(isValidPaletteColor('#1D3557'), true);
    assert.equal(isValidPaletteColor(pureLight), false);
    assert.equal(isValidPaletteColor(pureDark), false);
    assert.equal(isValidPaletteColor('red'), false);
  });

  it('migra registro legado sem schemaVersion (v0 -> v1) e rejeita versão futura', () => {
    const legacy = {
      id: 42,
      type: 'movie',
      title: 'Filme Antigo',
      year: 1999,
      score: 8.5
    };

    const migrated = normalizeWork(legacy);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.equal(migrated.id, 'legacy:42');
    assert.equal(migrated.scores.geral, 8.5);
    assert.equal(migrated.cover, null);
    assert.equal(Array.isArray(migrated.palette), true);
    assert.equal(validateWork(migrated).valid, true);

    const future = createWork({ title: 'Futuro', schemaVersion: 99 });
    const futureValidation = validateWork(future);
    assert.equal(futureValidation.valid, false);
    assert.ok(futureValidation.errors.some((e) => e.field === 'schemaVersion'));
  });

  it('valida o arquivo real data/canon.json do disco', async () => {
    const raw = await readFile(path.join(ROOT_DIR, 'data', 'canon.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeCatalog(parsed);
    const validation = validateCatalog(normalized);

    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    assert.equal(normalized.works.length, 3);

    const types = new Set(normalized.works.map((w) => w.type));
    assert.deepEqual(types, new Set(['anime', 'movie', 'game']));
    assert.ok(normalized.works.some((w) => w.scores.geral >= 9.0));
    assert.ok(normalized.works.some((w) => w.scores.geral < 5.0));
    assert.ok(normalized.works.every((w) => w.cover === null));
  });

  it('mescla obras públicas e locais com sobreposição por id e tombstone', () => {
    const pubA = createWork({ id: 'anilist:1', title: 'Pública A', type: 'anime', year: 2020 });
    const pubB = createWork({ id: 'tmdb:2', title: 'Pública B', type: 'movie', year: 2021 });
    const localOverrideA = createWork({ id: 'anilist:1', title: 'Local A Editada', type: 'anime', year: 2020 });
    const localTombstoneB = { id: 'tmdb:2', deleted: true, schemaVersion: 1 };
    const localNewC = createWork({ id: 'rawg:3', title: 'Local C', type: 'game', year: 2024 });

    const merged = mergeWorks([pubA, pubB], [localOverrideA, localTombstoneB, localNewC]);
    assert.equal(merged.length, 2);

    const itemA = merged.find((w) => w.id === 'anilist:1');
    const itemC = merged.find((w) => w.id === 'rawg:3');
    assert.equal(itemA?.title, 'Local A Editada');
    assert.equal(itemA?.source, 'local');
    assert.equal(itemC?.source, 'local');
    assert.equal(merged.some((w) => w.id === 'tmdb:2'), false);
  });
});

describe('store.js — fallback em memória, exportação e importação', () => {
  it('inicializa em memória, salva, exporta com lastBackupAt e recusa importação inválida', async () => {
    const raw = await readFile(path.join(ROOT_DIR, 'data', 'canon.json'), 'utf8');
    const canonPayload = JSON.parse(raw);

    const store = createStore({
      db: createDatabase(undefined),
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => canonPayload
      })
    });

    const initial = await store.init();
    assert.equal(initial.isMemoryFallback, true);
    assert.equal(initial.works.length, 3);
    assert.ok(initial.works.every((w) => w.source === 'public'));

    const created = await store.save(
      createWork({ id: 'rawg:999', title: 'Novo Jogo', type: 'game', year: 2025, scores: { geral: 9.0 } })
    );
    assert.equal(created.source, 'local');
    assert.equal(store.list().length, 4);

    const exported = await store.exportCanonJson();
    assert.equal(exported.schemaVersion, SCHEMA_VERSION);
    assert.equal(exported.works.length, 4);
    assert.ok(store.getSnapshot().lastBackupAt);

    const badImport = await store.importCanonJson('{"schemaVersion":1,"works":[{"id":"x"}]}');
    assert.equal(badImport.ok, false);
    assert.ok(badImport.errors.length > 0);
    assert.equal(store.list().length, 4);

    const validImport = await store.importCanonJson(JSON.stringify(canonPayload));
    assert.equal(validImport.ok, true);
    assert.equal(store.list().length, 3);
  });

  it('exportCanonJson NUNCA inclui chaves de API armazenadas no store meta', async () => {
    const db = createDatabase(undefined);
    await db.open();
    const fakeTmdbKey = 'tmdb_secret_key_do_not_export_12345';
    const fakeRawgKey = 'rawg_secret_key_do_not_export_67890';
    await db.put('meta', {
      key: 'apiKeys',
      value: { tmdb: fakeTmdbKey, rawg: fakeRawgKey }
    });

    const store = createStore({
      db,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ schemaVersion: 1, works: [] })
      })
    });
    await store.init();
    await store.save(
      createWork({
        id: 'manual:11111111-1111-4111-8111-111111111111',
        title: 'Sem Chaves',
        type: 'movie',
        year: 2026
      })
    );

    const exportedJson = JSON.stringify(await store.exportCanonJson());
    assert.equal(exportedJson.includes(fakeTmdbKey), false);
    assert.equal(exportedJson.includes(fakeRawgKey), false);
    assert.equal(exportedJson.includes('apiKeys'), false);
  });
});

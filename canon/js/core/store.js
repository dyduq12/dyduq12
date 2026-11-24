/**
 * Reactive store coordinating data/canon.json, IndexedDB persistence, validation, and import/export.
 */

import { createDatabase, STORES } from './db.js';
import { createEventBus } from './events.js';
import {
  SCHEMA_VERSION,
  mergeWorks,
  normalizeCatalog,
  normalizeWork,
  validateCatalog,
  validateWork
} from './schema.js';

const DEFAULT_CANON_URL = 'data/canon.json';
const META_LAST_BACKUP_KEY = 'lastBackupAt';

/**
 * Strips runtime-only metadata before persisting or exporting a work.
 * @param {Record<string, unknown>} work
 * @returns {Record<string, unknown>}
 */
function stripRuntimeFields(work) {
  const { source, deleted, ...clean } = work;
  return clean;
}

/**
 * Creates the CANON application store.
 * @param {{ db?: ReturnType<typeof createDatabase>, bus?: ReturnType<typeof createEventBus>, fetchFn?: typeof fetch, canonUrl?: string }} [deps]
 */
export function createStore(deps = {}) {
  const db = deps.db || createDatabase();
  const bus = deps.bus || createEventBus();
  const fetchFn = deps.fetchFn || globalThis.fetch;
  const canonUrl = deps.canonUrl || DEFAULT_CANON_URL;

  /** @type {Array<Record<string, unknown>>} */
  let publicWorks = [];
  /** @type {Array<Record<string, unknown>>} */
  let localRecords = [];
  /** @type {Array<Record<string, unknown> & { source: 'public' | 'local' }>} */
  let works = [];
  /** @type {string | null} */
  let lastBackupAt = null;
  /** @type {string[]} */
  let warnings = [];

  function recompute() {
    works = mergeWorks(publicWorks, localRecords);
    bus.emit('change', {
      works: list(),
      lastBackupAt,
      warnings: [...warnings],
      isMemoryFallback: db.isMemoryFallback()
    });
  }

  async function loadPublicCatalog() {
    if (typeof fetchFn !== 'function') {
      warnings.push('API fetch indisponível; iniciando sem catálogo público.');
      return [];
    }

    try {
      const response = await fetchFn(canonUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao carregar ${canonUrl}`);
      }
      const rawJson = await response.json();
      const normalized = normalizeCatalog(rawJson);
      const validation = validateCatalog(normalized);
      if (!validation.valid) {
        console.warn('[store.loadPublicCatalog] Catálogo público com avisos de validação:', validation.errors);
        warnings.push('Catálogo público contém entradas inválidas e foi carregado parcialmente.');
      }
      return normalized.works.filter((work) => validateWork(work).valid);
    } catch (err) {
      console.warn('[store.loadPublicCatalog] Falha ao carregar catálogo público:', {
        canonUrl,
        message: err?.message
      });
      warnings.push('Não foi possível carregar data/canon.json; exibindo apenas dados locais.');
      return [];
    }
  }

  async function init() {
    warnings = [];
    const dbStatus = await db.open();
    if (dbStatus.isMemoryFallback && dbStatus.fallbackReason) {
      warnings.push(dbStatus.fallbackReason);
    }

    publicWorks = await loadPublicCatalog();

    try {
      localRecords = await db.getAll(STORES.WORKS);
    } catch (err) {
      console.error('[store.init] Falha ao ler obras locais:', { message: err?.message });
      warnings.push('Não foi possível ler os registros salvos no banco local.');
      localRecords = [];
    }

    try {
      const metaRecord = await db.get(STORES.META, META_LAST_BACKUP_KEY);
      lastBackupAt = typeof metaRecord?.value === 'string' ? metaRecord.value : null;
    } catch (err) {
      console.warn('[store.init] Falha ao ler meta.lastBackupAt:', { message: err?.message });
      lastBackupAt = null;
    }

    recompute();
    return getSnapshot();
  }

  function list() {
    return works.map((item) => ({ ...item }));
  }

  function get(id) {
    const found = works.find((item) => item.id === id);
    return found ? { ...found } : null;
  }

  function getSnapshot() {
    return {
      works: list(),
      lastBackupAt,
      warnings: [...warnings],
      isMemoryFallback: db.isMemoryFallback()
    };
  }

  async function save(workInput) {
    const now = new Date().toISOString();
    const existing = workInput && typeof workInput.id === 'string' ? get(workInput.id) : null;
    const candidate = normalizeWork({
      ...workInput,
      schemaVersion: workInput?.schemaVersion ?? SCHEMA_VERSION,
      createdAt: existing?.createdAt || workInput?.createdAt || now,
      updatedAt: now
    });

    const validation = validateWork(candidate);
    if (!validation.valid) {
      const err = new Error(validation.errors.map((e) => `${e.field}: ${e.message}`).join(' | '));
      err.validationErrors = validation.errors;
      throw err;
    }

    const cleanRecord = stripRuntimeFields(candidate);
    try {
      await db.put(STORES.WORKS, cleanRecord);
    } catch (err) {
      console.error('[store.save] Falha ao salvar obra no banco:', {
        id: cleanRecord.id,
        message: err?.message
      });
      throw err;
    }

    const idx = localRecords.findIndex((item) => item.id === cleanRecord.id);
    if (idx >= 0) {
      localRecords[idx] = cleanRecord;
    } else {
      localRecords.push(cleanRecord);
    }

    recompute();
    const saved = get(cleanRecord.id);
    bus.emit('work:saved', { work: saved });
    return saved;
  }

  async function remove(id) {
    const isPublic = publicWorks.some((item) => item.id === id);
    try {
      if (isPublic) {
        const tombstone = {
          id,
          deleted: true,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: new Date().toISOString()
        };
        await db.put(STORES.WORKS, tombstone);
        const idx = localRecords.findIndex((item) => item.id === id);
        if (idx >= 0) {
          localRecords[idx] = tombstone;
        } else {
          localRecords.push(tombstone);
        }
      } else {
        await db.delete(STORES.WORKS, id);
        localRecords = localRecords.filter((item) => item.id !== id);
      }
    } catch (err) {
      console.error('[store.remove] Falha ao remover obra:', { id, message: err?.message });
      throw err;
    }

    recompute();
  }

  async function exportCanonJson() {
    const exportedAt = new Date().toISOString();
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      works: works.map((item) => stripRuntimeFields(item))
    };

    try {
      await db.put(STORES.META, { key: META_LAST_BACKUP_KEY, value: exportedAt });
      lastBackupAt = exportedAt;
      bus.emit('backup', { lastBackupAt });
      recompute();
    } catch (err) {
      console.error('[store.exportCanonJson] Falha ao atualizar meta.lastBackupAt:', {
        message: err?.message
      });
      throw err;
    }

    return payload;
  }

  async function importCanonJson(rawInput) {
    let parsed;
    try {
      parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    } catch (err) {
      return {
        ok: false,
        errors: [{ field: 'json', message: `JSON inválido: ${err?.message || 'erro de sintaxe'}` }]
      };
    }

    let normalized;
    try {
      normalized = normalizeCatalog(parsed);
    } catch (err) {
      return {
        ok: false,
        errors: [{ field: 'catalog', message: err?.message || 'Estrutura de catálogo inválida.' }]
      };
    }

    const validation = validateCatalog(normalized);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }

    const importedIds = new Set(normalized.works.map((w) => w.id));
    const nextLocalRecords = normalized.works.map((w) => stripRuntimeFields(w));

    for (const pub of publicWorks) {
      if (!importedIds.has(pub.id)) {
        nextLocalRecords.push({
          id: pub.id,
          deleted: true,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: new Date().toISOString()
        });
      }
    }

    try {
      await db.clear(STORES.WORKS);
      for (const record of nextLocalRecords) {
        await db.put(STORES.WORKS, record);
      }
    } catch (err) {
      console.error('[store.importCanonJson] Falha ao gravar catálogo importado:', {
        message: err?.message
      });
      throw err;
    }

    localRecords = nextLocalRecords;
    recompute();
    return { ok: true, count: normalized.works.length, errors: [] };
  }

  return {
    init,
    list,
    get,
    getSnapshot,
    save,
    remove,
    exportCanonJson,
    importCanonJson,
    on: bus.on,
    off: bus.off
  };
}

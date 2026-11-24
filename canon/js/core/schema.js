/**
 * Pure data schema, validation, migration, and catalog merge helpers for CANON.
 * Has zero DOM or IndexedDB dependencies so it runs identically in browsers and Node.js.
 */

export const SCHEMA_VERSION = 1;

export const WORK_TYPES = Object.freeze(['game', 'movie', 'series', 'anime']);

export const WORK_STATUSES = Object.freeze([
  'planned',
  'in_progress',
  'completed',
  'on_hold',
  'dropped'
]);

export const SCORE_KEYS = Object.freeze([
  'geral',
  'historia',
  'gameplay_ritmo',
  'graficos_fotografia',
  'trilha',
  'direcao_arte'
]);

export const DEFAULT_PALETTE = Object.freeze(['#264653', '#E76F51']);

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID_RE = /^[a-z][a-z0-9_-]*:[A-Za-z0-9._-]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const MIN_YEAR = 1888;
const MAX_YEAR = 2100;
const PURE_DARK_INT = 0;
const PURE_LIGHT_INT = 16777215;

/**
 * Generates a manual work identifier (`manual:<uuid>`).
 * @returns {string}
 */
export function generateManualId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `manual:${globalThis.crypto.randomUUID()}`;
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `manual:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Checks whether an ID follows `manual:<uuid>` or `provider:id`.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidWorkId(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return false;
  }
  if (id.startsWith('manual:')) {
    return UUID_RE.test(id.slice('manual:'.length));
  }
  return PROVIDER_ID_RE.test(id);
}

/**
 * Checks whether a color string is a valid 6-digit hex color excluding pure extremes.
 * @param {unknown} color
 * @returns {boolean}
 */
export function isValidPaletteColor(color) {
  if (typeof color !== 'string' || !HEX_COLOR_RE.test(color)) {
    return false;
  }
  const numeric = Number.parseInt(color.slice(1), 16);
  return numeric !== PURE_DARK_INT && numeric !== PURE_LIGHT_INT;
}

/**
 * Checks whether a score is a finite number in [0, 10] with 0.5 increments.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (value < 0 || value > 10) {
    return false;
  }
  return Number.isInteger(value * 2);
}

function createDefaultScores(overrides = {}) {
  const scores = {};
  for (const key of SCORE_KEYS) {
    const candidate = overrides && typeof overrides === 'object' ? overrides[key] : undefined;
    scores[key] = typeof candidate === 'number' ? candidate : 0;
  }
  return scores;
}

/**
 * Creates a new work object populated with schema defaults.
 * @param {Partial<Record<string, unknown>>} [overrides]
 * @returns {Record<string, unknown>}
 */
export function createWork(overrides = {}) {
  const now = new Date().toISOString();
  const base = overrides && typeof overrides === 'object' ? overrides : {};

  return {
    schemaVersion: base.schemaVersion ?? SCHEMA_VERSION,
    id: typeof base.id === 'string' && base.id ? base.id : generateManualId(),
    type: base.type ?? 'game',
    title: typeof base.title === 'string' ? base.title : '',
    year: base.year ?? new Date().getUTCFullYear(),
    genre: typeof base.genre === 'string' ? base.genre : '',
    studio: typeof base.studio === 'string' ? base.studio : '',
    director: typeof base.director === 'string' ? base.director : '',
    soundtrack: typeof base.soundtrack === 'string' ? base.soundtrack : '',
    starring: typeof base.starring === 'string' ? base.starring : '',
    cover: base.cover ?? null,
    palette: Array.isArray(base.palette) ? [...base.palette] : [...DEFAULT_PALETTE],
    scores: createDefaultScores(base.scores),
    pros: Array.isArray(base.pros) ? [...base.pros] : [],
    cons: Array.isArray(base.cons) ? [...base.cons] : [],
    status: base.status ?? 'planned',
    verdict: typeof base.verdict === 'string' ? base.verdict : '',
    createdAt: typeof base.createdAt === 'string' && base.createdAt ? base.createdAt : now,
    updatedAt: typeof base.updatedAt === 'string' && base.updatedAt ? base.updatedAt : now
  };
}

/**
 * Normalizes and migrates a raw work record to the current schemaVersion.
 * Preserves invalid user-supplied values so validateWork() can report exact errors.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeWork(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Obra deve ser um objeto JSON válido.');
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const version = input.schemaVersion === undefined ? 0 : input.schemaVersion;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ...input };
  }
  if (version > SCHEMA_VERSION) {
    return { ...input };
  }

  const now = new Date().toISOString();
  let migratedId = input.id;
  if (typeof migratedId === 'number' && Number.isFinite(migratedId)) {
    migratedId = `legacy:${String(migratedId)}`;
  }

  let migratedScores = input.scores;
  if (version === 0 && (!migratedScores || typeof migratedScores !== 'object')) {
    const legacyGeral = typeof input.score === 'number' ? input.score : 0;
    migratedScores = createDefaultScores({ geral: legacyGeral });
  } else if (migratedScores && typeof migratedScores === 'object' && !Array.isArray(migratedScores)) {
    migratedScores = { ...migratedScores };
    for (const key of SCORE_KEYS) {
      if (migratedScores[key] === undefined) {
        migratedScores[key] = 0;
      }
    }
  }

  const migrated = {
    schemaVersion: SCHEMA_VERSION,
    id: migratedId,
    type: input.type,
    title: typeof input.title === 'string' ? input.title.trim() : input.title,
    year: input.year,
    genre: input.genre ?? '',
    studio: input.studio ?? '',
    director: input.director ?? '',
    soundtrack: input.soundtrack ?? '',
    starring: input.starring ?? '',
    cover: input.cover === undefined ? null : input.cover,
    palette: input.palette === undefined && version === 0 ? [...DEFAULT_PALETTE] : input.palette,
    scores: migratedScores,
    pros: input.pros === undefined && version === 0 ? [] : input.pros,
    cons: input.cons === undefined && version === 0 ? [] : input.cons,
    status: input.status === undefined && version === 0 ? 'planned' : input.status,
    verdict: input.verdict ?? '',
    createdAt: input.createdAt === undefined && version === 0 ? now : input.createdAt,
    updatedAt: input.updatedAt === undefined && version === 0 ? now : input.updatedAt
  };

  return migrated;
}

/**
 * Validates a work object and returns specific field-level errors.
 * @param {unknown} work
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateWork(work) {
  /** @type {Array<{ field: string, message: string }>} */
  const errors = [];

  if (!work || typeof work !== 'object' || Array.isArray(work)) {
    errors.push({ field: 'work', message: 'Registro deve ser um objeto.' });
    return { valid: false, errors };
  }

  const w = /** @type {Record<string, unknown>} */ (work);

  if (typeof w.schemaVersion !== 'number' || !Number.isInteger(w.schemaVersion) || w.schemaVersion < 1) {
    errors.push({ field: 'schemaVersion', message: 'schemaVersion deve ser um inteiro positivo.' });
  } else if (w.schemaVersion > SCHEMA_VERSION) {
    errors.push({
      field: 'schemaVersion',
      message: `Versão ${w.schemaVersion} não suportada (máxima: ${SCHEMA_VERSION}).`
    });
  }

  if (!isValidWorkId(w.id)) {
    errors.push({
      field: 'id',
      message: 'ID deve seguir o formato "provider:id" ou "manual:<uuid>".'
    });
  }

  if (typeof w.type !== 'string' || !WORK_TYPES.includes(w.type)) {
    errors.push({
      field: 'type',
      message: `Tipo inválido. Valores aceitos: ${WORK_TYPES.join(', ')}.`
    });
  }

  if (typeof w.title !== 'string' || w.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Título é obrigatório e deve ser texto não vazio.' });
  }

  if (typeof w.year !== 'number' || !Number.isInteger(w.year) || w.year < MIN_YEAR || w.year > MAX_YEAR) {
    errors.push({
      field: 'year',
      message: `Ano deve ser um número inteiro entre ${MIN_YEAR} e ${MAX_YEAR}.`
    });
  }

  for (const textField of ['genre', 'studio', 'director', 'soundtrack', 'starring', 'verdict']) {
    if (typeof w[textField] !== 'string') {
      errors.push({ field: textField, message: `${textField} deve ser uma string.` });
    }
  }

  if (w.cover !== null && (typeof w.cover !== 'string' || w.cover.trim().length === 0)) {
    errors.push({ field: 'cover', message: 'cover deve ser null ou uma string não vazia.' });
  }

  if (!Array.isArray(w.palette) || w.palette.length !== 2) {
    errors.push({ field: 'palette', message: 'palette deve conter exatamente 2 cores hexadecimais.' });
  } else {
    w.palette.forEach((color, idx) => {
      if (!isValidPaletteColor(color)) {
        errors.push({
          field: `palette[${idx}]`,
          message: 'Cor deve ser hex #RRGGBB válida e não pode ser extremo puro.'
        });
      }
    });
  }

  if (!w.scores || typeof w.scores !== 'object' || Array.isArray(w.scores)) {
    errors.push({ field: 'scores', message: 'scores deve ser um objeto com os 6 critérios.' });
  } else {
    const scores = /** @type {Record<string, unknown>} */ (w.scores);
    for (const key of SCORE_KEYS) {
      if (!isValidScore(scores[key])) {
        errors.push({
          field: `scores.${key}`,
          message: 'Nota deve estar entre 0 e 10 em passos de 0,5.'
        });
      }
    }
  }

  for (const listField of ['pros', 'cons']) {
    if (!Array.isArray(w[listField])) {
      errors.push({ field: listField, message: `${listField} deve ser uma lista de textos.` });
    } else {
      w[listField].forEach((item, idx) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push({
            field: `${listField}[${idx}]`,
            message: 'Item da lista deve ser texto não vazio.'
          });
        }
      });
    }
  }

  if (typeof w.status !== 'string' || !WORK_STATUSES.includes(w.status)) {
    errors.push({
      field: 'status',
      message: `Status inválido. Valores aceitos: ${WORK_STATUSES.join(', ')}.`
    });
  }

  for (const dateField of ['createdAt', 'updatedAt']) {
    const val = w[dateField];
    if (typeof val !== 'string' || (!ISO_DATE_RE.test(val) && Number.isNaN(Date.parse(val)))) {
      errors.push({
        field: dateField,
        message: `${dateField} deve ser uma data ISO-8601 válida.`
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes and migrates a raw catalog payload (`canon.json`) to the current schemaVersion.
 * @param {unknown} raw
 * @returns {{ schemaVersion: number, exportedAt?: string, works: Array<Record<string, unknown>> }}
 */
export function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Catálogo deve ser um objeto JSON com campo works.');
  }
  const input = /** @type {Record<string, unknown>} */ (raw);
  const version = input.schemaVersion === undefined ? 0 : input.schemaVersion;
  const rawWorks = Array.isArray(input.works) ? input.works : null;

  if (!rawWorks) {
    return {
      schemaVersion: typeof version === 'number' ? version : 0,
      works: []
    };
  }

  const normalizedWorks = rawWorks.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    const workVersion = item.schemaVersion === undefined ? version : item.schemaVersion;
    return normalizeWork({ ...item, schemaVersion: workVersion });
  });

  const result = {
    schemaVersion: typeof version === 'number' && version <= SCHEMA_VERSION ? SCHEMA_VERSION : version,
    works: normalizedWorks
  };
  if (typeof input.exportedAt === 'string') {
    result.exportedAt = input.exportedAt;
  }
  return result;
}

/**
 * Validates a full catalog (`canon.json`) including schemaVersion, uniqueness, and each work.
 * @param {unknown} catalog
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateCatalog(catalog) {
  /** @type {Array<{ field: string, message: string }>} */
  const errors = [];

  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    errors.push({ field: 'catalog', message: 'Arquivo canon.json deve ser um objeto JSON.' });
    return { valid: false, errors };
  }

  const c = /** @type {Record<string, unknown>} */ (catalog);

  if (typeof c.schemaVersion !== 'number' || !Number.isInteger(c.schemaVersion) || c.schemaVersion < 1) {
    errors.push({ field: 'schemaVersion', message: 'schemaVersion do catálogo deve ser um inteiro positivo.' });
  } else if (c.schemaVersion > SCHEMA_VERSION) {
    errors.push({
      field: 'schemaVersion',
      message: `Versão do catálogo (${c.schemaVersion}) não suportada (máxima: ${SCHEMA_VERSION}).`
    });
  }

  if (!Array.isArray(c.works)) {
    errors.push({ field: 'works', message: 'works deve ser um array de obras.' });
    return { valid: false, errors };
  }

  const seenIds = new Set();
  c.works.forEach((work, index) => {
    const result = validateWork(work);
    for (const err of result.errors) {
      errors.push({
        field: `works[${index}].${err.field}`,
        message: err.message
      });
    }
    if (work && typeof work === 'object' && typeof work.id === 'string' && work.id) {
      if (seenIds.has(work.id)) {
        errors.push({
          field: `works[${index}].id`,
          message: `ID duplicado no catálogo: ${work.id}.`
        });
      }
      seenIds.add(work.id);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Pure merge of public catalog works (`canon.json`) with local IndexedDB records.
 * Local records with the same `id` override public works; local tombstones (`deleted: true`) hide them.
 * @param {Array<Record<string, unknown>>} publicWorks
 * @param {Array<Record<string, unknown>>} localRecords
 * @returns {Array<Record<string, unknown> & { source: 'public' | 'local' }>}
 */
export function mergeWorks(publicWorks = [], localRecords = []) {
  const localById = new Map();
  for (const record of localRecords) {
    if (record && typeof record === 'object' && typeof record.id === 'string') {
      localById.set(record.id, record);
    }
  }

  /** @type {Array<Record<string, unknown> & { source: 'public' | 'local' }>} */
  const merged = [];
  const consumedIds = new Set();

  for (const pub of publicWorks) {
    if (!pub || typeof pub !== 'object' || typeof pub.id !== 'string') {
      continue;
    }
    consumedIds.add(pub.id);
    const local = localById.get(pub.id);
    if (local) {
      if (local.deleted === true) {
        continue;
      }
      merged.push({ ...local, source: 'local' });
    } else {
      merged.push({ ...pub, source: 'public' });
    }
  }

  for (const record of localRecords) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') {
      continue;
    }
    if (consumedIds.has(record.id) || record.deleted === true) {
      continue;
    }
    merged.push({ ...record, source: 'local' });
  }

  return merged;
}

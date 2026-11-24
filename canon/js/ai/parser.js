/**
 * Pure, safe, tolerant AI JSON block parser (zero DOM dependencies).
 */

import {
  SCORE_KEYS,
  WORK_STATUSES,
  WORK_TYPES,
  createWork,
  validateWork
} from '../core/schema.js';

export const MAX_INPUT_CHARS = 20000;
export const MAX_LIST_ITEMS = 8;
export const MAX_ITEM_CHARS = 160;
export const MAX_FIELD_CHARS = 160;
export const MAX_VERDICT_CHARS = 400;

const ALLOWED_KEYS = new Set([
  'id',
  'type',
  'title',
  'year',
  'genre',
  'studio',
  'director',
  'soundtrack',
  'starring',
  'scores',
  'pros',
  'cons',
  'status',
  'verdict'
]);

const OPTIONAL_TEXT_FIELDS = ['genre', 'studio', 'director', 'soundtrack', 'starring'];
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function truncateValue(value, limit = 48) {
  const str = String(value);
  return str.length > limit ? `${str.slice(0, limit)}…` : str;
}

function clampText(text, maxChars, fieldName, warnings) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  warnings.push(`${fieldName}: texto cortado para ${maxChars} caracteres.`);
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

function extractBalancedJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function extractCandidateBlock(text, warnings) {
  const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fencedMatches.length > 0) {
    if (fencedMatches.length > 1) {
      warnings.push('Múltiplos blocos de código encontrados; usando apenas o primeiro bloco.');
    }
    return fencedMatches[0][1].trim();
  }

  const looseObjects = extractBalancedJsonObjects(text);
  if (looseObjects.length > 0) {
    if (looseObjects.length > 1) {
      warnings.push('Mais de um objeto JSON encontrado no texto; usando o primeiro.');
    }
    return looseObjects[0].trim();
  }

  return null;
}

function stripTrailingCommasOutsideStrings(jsonText) {
  let out = '';
  let inString = false;
  let escaped = false;
  let removed = 0;

  for (let i = 0; i < jsonText.length; i += 1) {
    const ch = jsonText[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < jsonText.length && /\s/.test(jsonText[j])) {
        j += 1;
      }
      if (j < jsonText.length && (jsonText[j] === '}' || jsonText[j] === ']')) {
        removed += 1;
        continue;
      }
    }

    out += ch;
  }

  return { text: out, removed };
}

function sanitizeJsonText(rawBlock, warnings) {
  let text = rawBlock;

  const normalizedQuotes = text
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  if (normalizedQuotes !== text) {
    warnings.push('Aspas tipográficas convertidas para aspas retas.');
    text = normalizedQuotes;
  }

  const trailingResult = stripTrailingCommasOutsideStrings(text);
  if (trailingResult.removed > 0) {
    warnings.push(`Vírgula(s) sobrando antes de } ou ] removida(s) (${trailingResult.removed}).`);
    text = trailingResult.text;
  }

  return text;
}

function estimateFailurePosition(jsonText) {
  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i < jsonText.length; i += 1) {
    const ch = jsonText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth < 0) {
        return i;
      }
    } else if (ch === ':' && /^\s*([}\],]|$)/.test(jsonText.slice(i + 1))) {
      return i + 1;
    }
  }
  return Math.max(0, jsonText.length - 1);
}

function formatJsonSyntaxError(err, jsonText) {
  const msg = String(err?.message || 'Erro de sintaxe JSON.');
  const posMatch = msg.match(/position\s+(\d+)/i);
  const pos = posMatch ? Number.parseInt(posMatch[1], 10) : estimateFailurePosition(jsonText);
  const before = jsonText.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return `JSON inválido na posição aproximada ${pos} (linha ${line}, coluna ${col}): ${msg}`;
}

function parseScoreEntry(rawValue, key, warnings, errors) {
  let num = rawValue;

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim().replace(',', '.');
    if (!trimmed) {
      errors.push({ field: `scores.${key}`, message: 'Nota ausente ou vazia.' });
      return null;
    }
    const parsedNum = Number(trimmed);
    if (!Number.isFinite(parsedNum)) {
      errors.push({
        field: `scores.${key}`,
        message: `Nota inválida ("${truncateValue(rawValue)}"): esperado número de 0 a 10.`
      });
      return null;
    }
    warnings.push(`scores.${key}: nota em texto ("${truncateValue(rawValue)}") convertida para número.`);
    num = parsedNum;
  }

  if (typeof num !== 'number' || !Number.isFinite(num)) {
    errors.push({
      field: `scores.${key}`,
      message: `Nota inválida (${truncateValue(rawValue)}): esperado número de 0 a 10.`
    });
    return null;
  }

  if (num < 0 || num > 10) {
    errors.push({
      field: `scores.${key}`,
      message: `Nota fora do intervalo permitido (0 a 10). Recebido: ${num}.`
    });
    return null;
  }

  if (!Number.isInteger(num * 2)) {
    const rounded = Number((Math.round(num * 2) / 2).toFixed(1));
    warnings.push(`scores.${key}: nota ${num} arredondada para ${rounded} (passo 0,5).`);
    return rounded;
  }

  return num;
}

function parseTextList(rawList, fieldName, warnings, errors) {
  if (rawList === undefined) {
    return [];
  }
  if (!Array.isArray(rawList)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} deve ser uma lista de textos (recebido ${typeof rawList}).`
    });
    return [];
  }

  const out = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const entry = rawList[i];
    if (typeof entry !== 'string') {
      errors.push({
        field: `${fieldName}[${i}]`,
        message: `Item deve ser texto (recebido ${typeof entry}).`
      });
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      warnings.push(`${fieldName}[${i}]: item vazio ignorado.`);
      continue;
    }
    if (out.length >= MAX_LIST_ITEMS) {
      warnings.push(`${fieldName}: limitado a ${MAX_LIST_ITEMS} itens; excedentes ignorados.`);
      break;
    }
    out.push(clampText(trimmed, MAX_ITEM_CHARS, `${fieldName}[${out.length}]`, warnings));
  }

  return out;
}

/**
 * Parses and validates an AI-generated text block into a CANON work object.
 * Never throws; returns `{ ok, work, emptyFields, warnings, errors }`.
 * @param {string} rawText
 */
export function parseAiImport(rawText) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {Array<{ field: string, message: string }>} */
  const errors = [];

  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    errors.push({ field: 'input', message: 'Cole um texto contendo o bloco JSON da IA.' });
    return { ok: false, work: null, emptyFields: [], warnings, errors };
  }

  if (rawText.length > MAX_INPUT_CHARS) {
    errors.push({
      field: 'input',
      message: `Texto excede o limite máximo de ${MAX_INPUT_CHARS} caracteres (recebido ${rawText.length}).`
    });
    return { ok: false, work: null, emptyFields: [], warnings, errors };
  }

  const cleanedInput = rawText
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (cleanedInput !== rawText) {
    warnings.push('BOM ou caracteres de controle removidos antes da leitura.');
  }

  const extracted = extractCandidateBlock(cleanedInput, warnings);
  if (!extracted) {
    errors.push({ field: 'json', message: 'Nenhum bloco JSON encontrado no texto colado.' });
    return { ok: false, work: null, emptyFields: [], warnings, errors };
  }

  const sanitizedJson = sanitizeJsonText(extracted, warnings);

  let parsedRaw;
  try {
    parsedRaw = JSON.parse(sanitizedJson);
  } catch (err) {
    errors.push({ field: 'json', message: formatJsonSyntaxError(err, sanitizedJson) });
    return { ok: false, work: null, emptyFields: [], warnings, errors };
  }

  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    errors.push({ field: 'json', message: 'O bloco JSON raiz deve ser um objeto { ... }.' });
    return { ok: false, work: null, emptyFields: [], warnings, errors };
  }

  const safeData = Object.create(null);
  for (const key of Object.keys(parsedRaw)) {
    if (DANGEROUS_KEYS.has(key)) {
      warnings.push(`Chave insegura ignorada: ${key}.`);
      continue;
    }
    if (!ALLOWED_KEYS.has(key)) {
      warnings.push(`Chave desconhecida ignorada: ${key}.`);
      continue;
    }
    safeData[key] = parsedRaw[key];
  }

  if (typeof safeData.type !== 'string' || !WORK_TYPES.includes(safeData.type)) {
    errors.push({
      field: 'type',
      message: `Tipo inválido ("${truncateValue(safeData.type)}"). Permitidos: ${WORK_TYPES.join(', ')}.`
    });
  }

  if (typeof safeData.title !== 'string' || safeData.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Título é obrigatório e deve ser texto não vazio.' });
  }

  if (typeof safeData.status !== 'string' || !WORK_STATUSES.includes(safeData.status)) {
    errors.push({
      field: 'status',
      message: `Status inválido ("${truncateValue(safeData.status)}"). Permitidos: ${WORK_STATUSES.join(', ')}.`
    });
  }

  const parsedScores = Object.create(null);
  if (!safeData.scores || typeof safeData.scores !== 'object' || Array.isArray(safeData.scores)) {
    errors.push({ field: 'scores', message: 'scores deve ser um objeto com os 6 critérios.' });
  } else {
    for (const key of Object.keys(safeData.scores)) {
      if (DANGEROUS_KEYS.has(key) || !SCORE_KEYS.includes(key)) {
        warnings.push(`Chave desconhecida em scores ignorada: ${key}.`);
      }
    }
    for (const key of SCORE_KEYS) {
      if (!Object.hasOwn(safeData.scores, key) || safeData.scores[key] === undefined || safeData.scores[key] === null) {
        errors.push({ field: `scores.${key}`, message: `Critério obrigatório ausente em scores: ${key}.` });
      } else {
        const val = parseScoreEntry(safeData.scores[key], key, warnings, errors);
        if (val !== null) {
          parsedScores[key] = val;
        }
      }
    }
  }

  const pros = parseTextList(safeData.pros, 'pros', warnings, errors);
  const cons = parseTextList(safeData.cons, 'cons', warnings, errors);

  let verdict = '';
  if (safeData.verdict !== undefined && safeData.verdict !== null) {
    if (typeof safeData.verdict !== 'string') {
      errors.push({ field: 'verdict', message: 'verdict deve ser uma string.' });
    } else {
      verdict = clampText(safeData.verdict, MAX_VERDICT_CHARS, 'verdict', warnings);
    }
  }

  const emptyFields = [];
  const textProps = Object.create(null);
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const rawVal = safeData[field];
    if (rawVal === undefined || rawVal === null) {
      textProps[field] = '';
      emptyFields.push(field);
    } else if (typeof rawVal !== 'string') {
      errors.push({ field, message: `${field} deve ser uma string.` });
      textProps[field] = '';
    } else {
      const cleaned = clampText(rawVal, MAX_FIELD_CHARS, field, warnings);
      textProps[field] = cleaned;
      if (!cleaned) {
        emptyFields.push(field);
      }
    }
  }

  let yearValue;
  if (safeData.year === undefined || safeData.year === null || safeData.year === '') {
    yearValue = new Date().getUTCFullYear();
    emptyFields.push('year');
  } else if (typeof safeData.year === 'string' && /^\d{4}$/.test(safeData.year.trim())) {
    yearValue = Number.parseInt(safeData.year.trim(), 10);
    warnings.push('year: convertido de string para número inteiro.');
  } else {
    yearValue = safeData.year;
  }

  if (errors.length > 0) {
    return { ok: false, work: null, emptyFields, warnings, errors };
  }

  const candidate = createWork({
    id: typeof safeData.id === 'string' && safeData.id.trim() ? safeData.id.trim() : undefined,
    type: safeData.type,
    title: clampText(safeData.title, MAX_FIELD_CHARS, 'title', warnings),
    year: yearValue,
    genre: textProps.genre,
    studio: textProps.studio,
    director: textProps.director,
    soundtrack: textProps.soundtrack,
    starring: textProps.starring,
    scores: parsedScores,
    pros,
    cons,
    status: safeData.status,
    verdict
  });

  const validation = validateWork(candidate);
  if (!validation.valid) {
    return {
      ok: false,
      work: null,
      emptyFields,
      warnings,
      errors: validation.errors
    };
  }

  return {
    ok: true,
    work: candidate,
    emptyFields,
    warnings,
    errors: []
  };
}

/**
 * Pure merge helper combining AI-parsed work (notes & user impressions) with external API metadata.
 * AI/user-filled fields are NEVER overwritten; the API only fills empty fields and sets provider:id.
 */

import { isValidWorkId } from '../core/schema.js';

const ENRICHABLE_FIELDS = ['year', 'genre', 'studio', 'director', 'soundtrack', 'starring'];

function isEmptyField(work, field, emptyFieldsSet) {
  if (emptyFieldsSet.has(field)) {
    return true;
  }
  const value = work?.[field];
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return false;
}

function hasApiValue(apiResult, field) {
  const value = apiResult?.[field];
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (field === 'year') {
    return Number.isInteger(value);
  }
  return true;
}

/**
 * Merges `aiWork` with `apiResult` without overwriting any AI/user-populated field.
 * @param {Record<string, any>} aiWork
 * @param {Record<string, any> | null | undefined} apiResult
 * @param {{ emptyFields?: string[] }} [options]
 * @returns {{
 *   work: Record<string, any>,
 *   filledFromApi: string[],
 *   preservedFromAi: string[]
 * }}
 */
export function mergeAiWithApi(aiWork, apiResult, options = {}) {
  const emptySet = new Set(Array.isArray(options.emptyFields) ? options.emptyFields : []);
  const merged = {
    ...aiWork,
    scores: { ...(aiWork?.scores || {}) },
    pros: Array.isArray(aiWork?.pros) ? [...aiWork.pros] : [],
    cons: Array.isArray(aiWork?.cons) ? [...aiWork.cons] : [],
    palette: Array.isArray(aiWork?.palette) ? [...aiWork.palette] : []
  };

  /** @type {string[]} */
  const filledFromApi = [];
  /** @type {string[]} */
  const preservedFromAi = [];

  if (!apiResult || typeof apiResult !== 'object') {
    for (const field of ENRICHABLE_FIELDS) {
      if (!isEmptyField(aiWork, field, emptySet)) {
        preservedFromAi.push(field);
      }
    }
    return { work: merged, filledFromApi, preservedFromAi };
  }

  if (typeof apiResult.id === 'string' && !apiResult.id.startsWith('manual:') && isValidWorkId(apiResult.id)) {
    merged.id = apiResult.id;
    filledFromApi.push('id');
  }

  for (const field of ENRICHABLE_FIELDS) {
    const aiIsEmpty = isEmptyField(aiWork, field, emptySet);
    if (aiIsEmpty && hasApiValue(apiResult, field)) {
      merged[field] = typeof apiResult[field] === 'string' ? apiResult[field].trim() : apiResult[field];
      filledFromApi.push(field);
    } else if (!aiIsEmpty) {
      preservedFromAi.push(field);
    }
  }

  if (!merged.cover && typeof apiResult.coverUrl === 'string' && apiResult.coverUrl.trim()) {
    merged.coverUrl = apiResult.coverUrl.trim();
    filledFromApi.push('coverUrl');
  }

  return {
    work: merged,
    filledFromApi,
    preservedFromAi
  };
}

/**
 * TMDB API v3 adapter for movies and TV series with credits normalization.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { getApiKey } from '../ui/settings.js';
import { HttpError, fetchJson } from './http.js';

export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

function parseYear(dateStr) {
  if (typeof dateStr !== 'string' || dateStr.length < 4) {
    return new Date().getUTCFullYear();
  }
  const year = Number.parseInt(dateStr.slice(0, 4), 10);
  return Number.isInteger(year) ? year : new Date().getUTCFullYear();
}

function buildPosterUrl(posterPath) {
  if (typeof posterPath !== 'string' || !posterPath.trim()) {
    return null;
  }
  return `${TMDB_IMAGE_BASE_URL}${posterPath}`;
}

async function resolveTmdbKey(options) {
  if (typeof options.apiKey === 'string') {
    const k = options.apiKey.trim();
    if (k) {
      return k;
    }
  }
  if (options.db) {
    const stored = await getApiKey(options.db, 'tmdb');
    if (stored) {
      return stored;
    }
  }
  throw new HttpError('missing_key', 'Chave da API TMDB ausente. Configure-a em Configurações ou use entrada manual.');
}

/**
 * Normalizes a basic TMDB search result (movie or tv) into a CANON draft item.
 * @param {Record<string, any>} item
 * @param {'movie' | 'series'} type
 */
export function normalizeTmdbSearchItem(item, type) {
  const isMovie = type === 'movie';
  return {
    id: `tmdb:${item.id}`,
    tmdbId: item.id,
    type,
    title: String(isMovie ? item.title || item.original_title || '' : item.name || item.original_name || ''),
    year: parseYear(isMovie ? item.release_date : item.first_air_date),
    genre: '',
    studio: '',
    director: '',
    soundtrack: '',
    starring: '',
    coverUrl: buildPosterUrl(item.poster_path),
    cover: null,
    palette: [...DEFAULT_PALETTE],
    detailsLoaded: false
  };
}

/**
 * Normalizes TMDB details + credits payload (`append_to_response=credits`) into a CANON draft.
 * @param {Record<string, any>} details
 * @param {'movie' | 'series'} type
 */
export function normalizeTmdbDetails(details, type) {
  const base = normalizeTmdbSearchItem(details, type);
  const crew = Array.isArray(details?.credits?.crew) ? details.credits.crew : [];
  const cast = Array.isArray(details?.credits?.cast) ? details.credits.cast : [];

  let director = '';
  if (type === 'movie') {
    director = crew
      .filter((member) => member?.job === 'Director' && member?.name)
      .slice(0, 2)
      .map((member) => member.name)
      .join(', ');
  } else {
    const creators = Array.isArray(details?.created_by) ? details.created_by : [];
    director = creators
      .filter((person) => person?.name)
      .slice(0, 2)
      .map((person) => person.name)
      .join(', ');
    if (!director) {
      director = crew
        .filter((member) => /director|creator|showrunner/i.test(String(member?.job || '')) && member?.name)
        .slice(0, 2)
        .map((member) => member.name)
        .join(', ');
    }
  }

  const soundtrack = crew
    .filter((member) => /music|composer/i.test(String(member?.job || '')) && member?.name)
    .slice(0, 2)
    .map((member) => member.name)
    .join(', ');

  const starring = cast
    .filter((member) => member?.name)
    .slice(0, 3)
    .map((member) => member.name)
    .join(', ');

  const genres = Array.isArray(details?.genres)
    ? details.genres.map((g) => g?.name).filter(Boolean).join(', ')
    : '';

  const studiosSource =
    type === 'series' && Array.isArray(details?.networks) && details.networks.length > 0
      ? details.networks
      : details?.production_companies;
  const studio = Array.isArray(studiosSource)
    ? studiosSource.map((c) => c?.name).filter(Boolean).slice(0, 2).join(', ')
    : '';

  return {
    ...base,
    genre: genres,
    studio,
    director,
    soundtrack,
    starring,
    detailsLoaded: true
  };
}

/**
 * Searches TMDB for movies or series. Fails fast with HttpError('missing_key') if no key is stored.
 * @param {string} query
 * @param {'movie' | 'series'} type
 * @param {{ apiKey?: string, db?: unknown, signal?: AbortSignal, fetchFn?: typeof fetch }} [options]
 */
export async function searchTmdb(query, type = 'movie', options = {}) {
  const apiKey = await resolveTmdbKey(options);
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return [];
  }

  const mediaSegment = type === 'series' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/search/${mediaSegment}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(trimmed)}&language=pt-BR`;

  const payload = await fetchJson(url, {
    signal: options.signal,
    fetchFn: options.fetchFn
  });

  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.slice(0, 8).map((item) => normalizeTmdbSearchItem(item, type));
}

/**
 * Fetches full TMDB details and credits (`append_to_response=credits`) for a selected movie or series.
 * @param {string | number} tmdbId
 * @param {'movie' | 'series'} type
 * @param {{ apiKey?: string, db?: unknown, signal?: AbortSignal, fetchFn?: typeof fetch }} [options]
 */
export async function fetchTmdbDetails(tmdbId, type = 'movie', options = {}) {
  const apiKey = await resolveTmdbKey(options);
  const numericId = String(tmdbId).replace(/^tmdb:/, '');
  const mediaSegment = type === 'series' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${mediaSegment}/${encodeURIComponent(numericId)}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits&language=pt-BR`;

  const payload = await fetchJson(url, {
    signal: options.signal,
    fetchFn: options.fetchFn
  });

  return normalizeTmdbDetails(payload, type);
}

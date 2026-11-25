/**
 * Pure display model builder for CANON editorial cards (Node-testable, zero DOM).
 */

import { DEFAULT_PALETTE, isValidPaletteColor } from '../core/schema.js';

export const HALL_OF_FAME_THRESHOLD = 9.0;
export const EMPTY_SPEC_FALLBACK = '—';

const TYPE_LABELS = Object.freeze({
  game: 'GAME',
  movie: 'MOVIE',
  series: 'SERIES',
  anime: 'ANIME'
});

const STATUS_LABELS = Object.freeze({
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  on_hold: 'Pausado',
  dropped: 'Abandonado'
});

const TECH_SPEC_FIELDS_BY_TYPE = Object.freeze({
  game: [
    { key: 'genre', label: 'GENRE' },
    { key: 'studio', label: 'DEVELOPED BY' },
    { key: 'soundtrack', label: 'SOUNDTRACK' }
  ],
  movie: [
    { key: 'genre', label: 'GENRE' },
    { key: 'director', label: 'DIRECTED BY' },
    { key: 'soundtrack', label: 'SOUNDTRACK' },
    { key: 'starring', label: 'STARRING' }
  ],
  series: [
    { key: 'genre', label: 'GENRE' },
    { key: 'director', label: 'DIRECTED BY' },
    { key: 'soundtrack', label: 'SOUNDTRACK' },
    { key: 'starring', label: 'STARRING' }
  ],
  anime: [
    { key: 'genre', label: 'GENRE' },
    { key: 'studio', label: 'STUDIO' },
    { key: 'director', label: 'DIRECTED BY' },
    { key: 'soundtrack', label: 'SOUNDTRACK' },
    { key: 'starring', label: 'STARRING' }
  ]
});

// Only the 4 active criteria are shown. `direcao_arte` (legacy) never appears as a bar.
const CRITERION_LABELS_BY_TYPE = Object.freeze({
  game: [
    { key: 'historia', label: 'História' },
    { key: 'gameplay_ritmo', label: 'Gameplay' },
    { key: 'graficos_fotografia', label: 'Gráficos' },
    { key: 'trilha', label: 'Trilha Sonora' }
  ],
  movie: [
    { key: 'historia', label: 'História / Roteiro' },
    { key: 'gameplay_ritmo', label: 'Ritmo' },
    { key: 'graficos_fotografia', label: 'Fotografia' },
    { key: 'trilha', label: 'Trilha Sonora' }
  ],
  series: [
    { key: 'historia', label: 'História / Roteiro' },
    { key: 'gameplay_ritmo', label: 'Ritmo' },
    { key: 'graficos_fotografia', label: 'Fotografia' },
    { key: 'trilha', label: 'Trilha Sonora' }
  ],
  anime: [
    { key: 'historia', label: 'História' },
    { key: 'gameplay_ritmo', label: 'Ritmo / Animação' },
    { key: 'graficos_fotografia', label: 'Visual / Fotografia' },
    { key: 'trilha', label: 'Trilha Sonora' }
  ]
});

function formatSpecValue(value) {
  if (typeof value !== 'string') {
    return EMPTY_SPEC_FALLBACK;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_SPEC_FALLBACK;
}

/**
 * Formats a score with 1 decimal place and a comma (e.g. 8.875 -> "8,9").
 * The exact value (multiples of 0.125) stays untouched in the model; only the display is rounded.
 * @param {unknown} value
 * @returns {string}
 */
function formatScore(value) {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return num.toFixed(1).replace('.', ',');
}

function resolveSafePalette(palette) {
  if (!Array.isArray(palette) || palette.length !== 2) {
    return [...DEFAULT_PALETTE];
  }
  const a = isValidPaletteColor(palette[0]) ? palette[0] : DEFAULT_PALETTE[0];
  const b = isValidPaletteColor(palette[1]) ? palette[1] : DEFAULT_PALETTE[1];
  return [a, b];
}

/**
 * Returns uppercase technical specification rows for the card front based on media type.
 * @param {Record<string, any>} work
 * @returns {Array<{ key: string, label: string, value: string }>}
 */
export function getTechSpecsForWork(work) {
  const type = TECH_SPEC_FIELDS_BY_TYPE[work?.type] ? work.type : 'game';
  const specDefs = TECH_SPEC_FIELDS_BY_TYPE[type];
  return specDefs.map((def) => ({
    key: def.key,
    label: def.label,
    value: formatSpecValue(work?.[def.key])
  }));
}

/**
 * Returns the 4 criterion bar descriptors adapted to the work's media type.
 * @param {string} type
 * @returns {Array<{ key: string, label: string }>}
 */
export function getCriterionLabelsForType(type) {
  return CRITERION_LABELS_BY_TYPE[type] || CRITERION_LABELS_BY_TYPE.game;
}

/**
 * Computes Hall of Fame metadata for a given overall score.
 * @param {unknown} geralScore
 * @returns {{ isHallOfFame: boolean, badgeLabel: string | null, tier: 'hall_of_fame' | 'standard' }}
 */
export function getHallOfFameInfo(geralScore) {
  const score = typeof geralScore === 'number' && Number.isFinite(geralScore) ? geralScore : 0;
  if (score >= HALL_OF_FAME_THRESHOLD) {
    return {
      isHallOfFame: true,
      badgeLabel: 'HALL DA FAMA',
      tier: 'hall_of_fame'
    };
  }
  return {
    isHallOfFame: false,
    badgeLabel: null,
    tier: 'standard'
  };
}

/**
 * Builds the complete pure view model for an editorial card.
 * @param {Record<string, any>} work
 */
export function buildCardModel(work) {
  const safeWork = work && typeof work === 'object' ? work : {};
  const type = TYPE_LABELS[safeWork.type] ? safeWork.type : 'game';
  const titleRaw = typeof safeWork.title === 'string' && safeWork.title.trim() ? safeWork.title.trim() : 'SEM TÍTULO';
  const titleUpper = titleRaw.toUpperCase();
  const monogram = titleUpper
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('') || 'CN';

  const scores = safeWork.scores && typeof safeWork.scores === 'object' ? safeWork.scores : {};
  const geralScore = typeof scores.geral === 'number' && Number.isFinite(scores.geral) ? scores.geral : 0;
  const criterionDefs = getCriterionLabelsForType(type);

  const criteriaBars = criterionDefs.map((def) => {
    const val = typeof scores[def.key] === 'number' && Number.isFinite(scores[def.key]) ? scores[def.key] : 0;
    const clamped = Math.max(0, Math.min(10, val));
    return {
      key: def.key,
      label: def.label,
      score: clamped,
      scoreFormatted: formatScore(clamped),
      percent: Math.round((clamped / 10) * 100)
    };
  });

  const pros = Array.isArray(safeWork.pros) && safeWork.pros.length > 0 ? [...safeWork.pros] : [EMPTY_SPEC_FALLBACK];
  const cons = Array.isArray(safeWork.cons) && safeWork.cons.length > 0 ? [...safeWork.cons] : [EMPTY_SPEC_FALLBACK];

  return {
    id: safeWork.id || '',
    type,
    typeLabel: TYPE_LABELS[type],
    titleRaw,
    titleUpper,
    monogram,
    yearText: Number.isInteger(safeWork.year) ? String(safeWork.year) : EMPTY_SPEC_FALLBACK,
    cover: typeof safeWork.cover === 'string' && safeWork.cover ? safeWork.cover : null,
    palette: resolveSafePalette(safeWork.palette),
    techSpecs: getTechSpecsForWork({ ...safeWork, type }),
    geralScore,
    geralFormatted: formatScore(geralScore),
    hallOfFame: getHallOfFameInfo(geralScore),
    criteriaBars,
    pros,
    cons,
    statusLabel: STATUS_LABELS[safeWork.status] || EMPTY_SPEC_FALLBACK,
    verdictText: formatSpecValue(safeWork.verdict),
    sourceLabel: safeWork.source === 'local' ? 'local' : 'public'
  };
}

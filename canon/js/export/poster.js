/**
 * 1080x1350 editorial PNG poster renderer (Canvas 2D).
 * Strict R2 protection: draws ONLY same-origin cover Blobs (IndexedDB `covers` or relative `covers/`),
 * resolves all colors and concrete font stacks from `theme`, uses deterministic seeded grain,
 * wraps `canvas.toBlob` with timeout & SecurityError handling, and reuses `drawWorld` for mascots.
 * Waits for the editorial web fonts (when a DOM exists) and renders only the 4 active criteria.
 */

import { STORES } from '../core/db.js';
import { CRITERIA_KEYS, DEFAULT_PALETTE } from '../core/schema.js';
import {
  FIXED_DT,
  advance,
  createSeededRng,
  createWorld,
  drawWorld,
  setInputs
} from '../mascots/engine.js';
import { POSTER_HEIGHT, POSTER_WIDTH, computePosterLayout, resolvePosterFonts } from './layout.js';

const DEFAULT_TOBLOB_TIMEOUT_MS = 8000;
const MASCOT_PREROLL_STEPS = 20;
const GRAIN_POINT_COUNT = 1600;

// Weights match the canvas drawing code (titles, mono labels, serif body and verdict).
const EDITORIAL_FONT_SPECS = Object.freeze([
  '800 48px "Big Shoulders Display"',
  '700 18px "IBM Plex Mono"',
  '600 20px "Source Serif 4"',
  '500 22px "Source Serif 4"'
]);

/**
 * Waits for the editorial fonts before any text is measured or drawn on a canvas.
 * Safe in Node and other environments without a DOM: resolves `false` when `document.fonts` is missing.
 * Never rejects; a font that fails to load simply falls back to the stack defined in the layout.
 * @param {Document} [doc]
 * @returns {Promise<boolean>}
 */
export async function ensureEditorialFonts(doc = globalThis.document) {
  const fontSet = doc && doc.fonts;
  if (!fontSet || typeof fontSet.load !== 'function') {
    return false;
  }
  try {
    await Promise.all(EDITORIAL_FONT_SPECS.map((spec) => fontSet.load(spec)));
    if (fontSet.ready && typeof fontSet.ready.then === 'function') {
      await fontSet.ready;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Typed error for PNG poster rendering/encoding failures.
 */
export class PosterExportError extends Error {
  /**
   * @param {'CANVAS_UNAVAILABLE' | 'TAINTED_CANVAS' | 'EXPORT_TIMEOUT' | 'BLOB_EMPTY' | 'INVALID_WORK' | 'DRAW_FAILED'} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'PosterExportError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function finiteOr(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Checks whether a cover reference is safe same-origin (`covers/...` relative path without protocol or traversal).
 * Rejects `http:`, `https:`, `data:`, `blob:`, `javascript:`, `//`, and `..`.
 * @param {unknown} coverRef
 * @returns {boolean}
 */
export function isSafeLocalCoverPath(coverRef) {
  if (typeof coverRef !== 'string') {
    return false;
  }
  const trimmed = coverRef.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return false;
  }
  return trimmed.startsWith('covers/') || trimmed.startsWith('./covers/');
}

export function normalizePosterTheme(theme, palette) {
  const workPalette = Array.isArray(palette) && palette.length === 2 ? palette : DEFAULT_PALETTE;
  const fallbackA = workPalette[0] || DEFAULT_PALETTE[0];
  const fallbackB = workPalette[1] || DEFAULT_PALETTE[1];
  const safe = theme && typeof theme === 'object' ? theme : {};

  const bg = safe.bg || safe.paper || fallbackA;
  const surface = safe.surface || bg;
  const surfaceAlt = safe.surfaceAlt || surface;
  const text = safe.text || safe.ink || fallbackA;
  const textMuted = safe.textMuted || text;
  const border = safe.border || textMuted;
  const borderStrong = safe.borderStrong || text;
  const accent = safe.accent || fallbackB;
  const accentContrast = safe.accentContrast || surface;
  const grainAlpha = Math.max(0.01, Math.min(0.15, finiteOr(safe.grainAlpha, 0.045)));

  const mascotInput = safe.mascot && typeof safe.mascot === 'object' ? safe.mascot : {};
  const mascotAccent = mascotInput.accent || accent;
  // Individual mascot inks: accept both `inkKoma` and the engine alias `komaInk`, falling back to the accent.
  const inkFor = (id) => {
    const cap = id.charAt(0).toUpperCase() + id.slice(1);
    return mascotInput[`ink${cap}`] || mascotInput[`${id}Ink`] || mascotAccent;
  };
  const inkKoma = inkFor('koma');
  const inkSave = inkFor('save');
  const inkKino = inkFor('kino');
  const inkEcho = inkFor('echo');

  return {
    id: safe.id === 'slate' ? 'slate' : 'paper',
    bg,
    surface,
    surfaceAlt,
    text,
    textMuted,
    border,
    borderStrong,
    accent,
    accentContrast,
    workA: fallbackA,
    workB: fallbackB,
    grainAlpha,
    fonts: resolvePosterFonts(safe.fonts),
    mascot: {
      ink: mascotInput.ink || text,
      paper: mascotInput.paper || surface,
      surface: mascotInput.surface || surfaceAlt,
      accent: mascotAccent,
      glow: mascotInput.glow || fallbackB,
      crack: mascotInput.crack || accent,
      inkKoma,
      inkSave,
      inkKino,
      inkEcho,
      komaInk: inkKoma,
      saveInk: inkSave,
      kinoInk: inkKino,
      echoInk: inkEcho,
      workA: fallbackA,
      workB: fallbackB
    }
  };
}

export function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const rx = finiteOr(x, 0);
  const ry = finiteOr(y, 0);
  const rw = Math.max(0, finiteOr(width, 0));
  const rh = Math.max(0, finiteOr(height, 0));
  const r = Math.max(0, Math.min(finiteOr(radius, 0), rw / 2, rh / 2));

  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(rx, ry, rw, rh);
    return;
  }
  ctx.moveTo(rx + r, ry);
  ctx.lineTo(rx + rw - r, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
  ctx.lineTo(rx + rw, ry + rh - r);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
  ctx.lineTo(rx + r, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
  ctx.lineTo(rx, ry + r);
  ctx.quadraticCurveTo(rx, ry, rx + r, ry);
  ctx.closePath();
}

export function drawDeterministicGrain(ctx, width, height, theme, seed) {
  const rng = createSeededRng(seed);
  ctx.save();
  for (let i = 0; i < GRAIN_POINT_COUNT; i += 1) {
    const gx = Math.floor(rng() * width);
    const gy = Math.floor(rng() * height);
    const size = rng() > 0.72 ? 2 : 1;
    const toneLight = rng() > 0.5;
    ctx.fillStyle = toneLight ? theme.surface : theme.text;
    ctx.globalAlpha = theme.grainAlpha * (0.4 + rng() * 0.6);
    ctx.fillRect(gx, gy, size, size);
  }
  ctx.restore();
}

function drawCoverSection(ctx, coverRect, data, layout, theme) {
  const { x, y, width, height } = coverRect;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, 10);
  ctx.fillStyle = theme.surfaceAlt;
  ctx.fill();
  ctx.clip();

  const coverImg = data.coverImage;
  const imgW = finiteOr(coverImg?.width ?? coverImg?.naturalWidth, 0);
  const imgH = finiteOr(coverImg?.height ?? coverImg?.naturalHeight, 0);

  if (coverImg && imgW > 0 && imgH > 0) {
    const srcRatio = imgW / imgH;
    const destRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = imgW;
    let sh = imgH;

    if (srcRatio > destRatio) {
      sw = imgH * destRatio;
      sx = (imgW - sw) / 2;
    } else if (srcRatio < destRatio) {
      sh = imgW / destRatio;
      sy = (imgH - sh) / 2;
    }
    ctx.drawImage(coverImg, sx, sy, sw, sh, x, y, width, height);
  } else {
    const grad = ctx.createLinearGradient(x, y, x + width, y + height);
    grad.addColorStop(0, theme.workA);
    grad.addColorStop(1, theme.workB);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = theme.surface;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, y + height * 0.75);
    ctx.lineTo(x + width + 20, y + height * 0.25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = theme.surface;
    ctx.font = `800 84px ${theme.fonts.condensed}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layout.model.monogram || 'CN', x + width / 2, y + height / 2);
  }

  ctx.restore();

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, 10);
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderStrong;
  ctx.stroke();
  ctx.restore();
}

function drawHeaderSection(ctx, layout, theme) {
  const { headerRect, model } = layout;

  ctx.save();
  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 18px ${theme.fonts.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('CANON · EDIÇÃO EDITORIAL', headerRect.x, headerRect.y + headerRect.height / 2);

  const pillText = `${model.typeLabel} · ${model.yearText}`;
  ctx.font = `700 18px ${theme.fonts.mono}`;
  const measuredW = finiteOr(ctx.measureText(pillText).width, pillText.length * 11);
  const pillW = Math.min(260, Math.max(116, Math.round(measuredW + 28)));
  const pillH = 34;
  const pillX = headerRect.x + headerRect.width - pillW;
  const pillY = headerRect.y + (headerRect.height - pillH) / 2;

  drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 17);
  ctx.fillStyle = theme.workA;
  ctx.fill();

  ctx.fillStyle = theme.accentContrast;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 1);

  ctx.strokeStyle = theme.borderStrong;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headerRect.x, headerRect.y + headerRect.height);
  ctx.lineTo(headerRect.x + headerRect.width, headerRect.y + headerRect.height);
  ctx.stroke();
  ctx.restore();
}

function drawTitleAndSpecsSection(ctx, layout, theme) {
  const { titleRect, titleFit, specsRows } = layout;

  ctx.save();
  ctx.fillStyle = theme.text;
  ctx.font = titleFit.fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  titleFit.lines.forEach((line, index) => {
    ctx.fillText(line, titleRect.x, titleRect.y + index * titleFit.lineHeight);
  });

  const dividerY = titleRect.y + Math.max(titleRect.height, 84) + 10;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(titleRect.x, dividerY, 96, 5);

  for (const row of specsRows) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = `700 13px ${theme.fonts.mono}`;
    ctx.fillText(row.label, row.x, row.y);

    ctx.fillStyle = theme.text;
    ctx.font = row.fontSpec;
    ctx.fillText(row.value, row.x, row.y + 18);
  }
  ctx.restore();
}

function drawScoreAndVerdictSection(ctx, layout, theme) {
  const { scoreRect, scoreValueRect, badgeRect, verdictRect, verdictFit, model } = layout;

  ctx.save();
  drawRoundedRectPath(ctx, scoreRect.x, scoreRect.y, scoreRect.width, scoreRect.height, 10);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.fillStyle = theme.workB;
  ctx.fillRect(scoreRect.x, scoreRect.y + 12, 6, scoreRect.height - 24);

  ctx.fillStyle = theme.text;
  ctx.font = `800 66px ${theme.fonts.condensed}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(model.geralFormatted, scoreValueRect.x, scoreValueRect.y);

  const scoreWidth = finiteOr(ctx.measureText(model.geralFormatted).width, 92);
  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 22px ${theme.fonts.mono}`;
  ctx.fillText('/ 10', scoreValueRect.x + scoreWidth + 10, scoreValueRect.y + 12);

  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 15px ${theme.fonts.mono}`;
  ctx.fillText(`STATUS: ${model.statusLabel.toLocaleUpperCase('pt-BR')}`, scoreValueRect.x, scoreValueRect.y + 78);

  if (badgeRect && model.hallOfFame.badgeLabel) {
    drawRoundedRectPath(ctx, badgeRect.x, badgeRect.y, badgeRect.width, badgeRect.height, 8);
    ctx.fillStyle = theme.accent;
    ctx.fill();

    ctx.fillStyle = theme.accentContrast;
    ctx.font = `800 17px ${theme.fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(model.hallOfFame.badgeLabel, badgeRect.x + badgeRect.width / 2, badgeRect.y + badgeRect.height / 2 + 1);
  }

  ctx.fillStyle = theme.text;
  ctx.font = verdictFit.fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  verdictFit.lines.forEach((line, index) => {
    ctx.fillText(line, verdictRect.x, verdictRect.y + index * verdictFit.lineHeight);
  });

  ctx.restore();
}

// Draws the 4 active criteria rows computed by the layout (one row per `layout.bars` entry).
function drawCriteriaBarsSection(ctx, layout, theme) {
  ctx.save();
  for (let i = 0; i < layout.bars.length; i += 1) {
    const bar = layout.bars[i];
    const ratio = Math.max(0, Math.min(1, finiteOr(bar.percent, 0) / 100));
    const labelY = bar.y + 4;
    const trackY = bar.y + 28;
    const trackH = Math.max(10, Math.min(16, bar.height - 32));

    ctx.fillStyle = theme.text;
    ctx.font = `600 19px ${theme.fonts.body}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(bar.label, bar.x, labelY);

    ctx.fillStyle = theme.text;
    ctx.font = `700 19px ${theme.fonts.mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(bar.scoreFormatted, bar.x + bar.width, labelY);

    drawRoundedRectPath(ctx, bar.x, trackY, bar.width, trackH, trackH / 2);
    ctx.fillStyle = theme.surfaceAlt;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.border;
    ctx.stroke();

    const fillW = Math.round(bar.width * ratio);
    if (fillW > 0) {
      drawRoundedRectPath(ctx, bar.x, trackY, Math.max(trackH, fillW), trackH, trackH / 2);
      ctx.fillStyle = i % 2 === 0 ? theme.workA : theme.accent;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMascotsBand(ctx, data, layout, theme) {
  if (!layout.mascotRect || !data.mascotWorld) {
    return;
  }
  const rect = layout.mascotRect;
  const worldHeight = Math.max(64, rect.height - 26);

  ctx.save();
  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.clip();

  ctx.save();
  ctx.translate(rect.x, rect.y + 2);
  drawWorld(ctx, data.mascotWorld, { width: rect.width, height: worldHeight }, theme.mascot);
  ctx.restore();

  const names = ['KOMA', 'SAVE', 'KINO', 'ECHO'];
  const cellW = rect.width / 4;
  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 13px ${theme.fonts.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  names.forEach((name, idx) => {
    ctx.fillText(name, rect.x + cellW * idx + cellW / 2, rect.y + rect.height - 6);
  });

  ctx.restore();
}

function drawFooterSection(ctx, layout, theme) {
  const { footerRect } = layout;
  ctx.save();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(footerRect.x, footerRect.y);
  ctx.lineTo(footerRect.x + footerRect.width, footerRect.y);
  ctx.stroke();

  ctx.fillStyle = theme.textMuted;
  ctx.font = `600 14px ${theme.fonts.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('CANON · ACERVO EDITORIAL PESSOAL', footerRect.x, footerRect.y + footerRect.height);

  ctx.textAlign = 'right';
  ctx.fillText('1080×1350', footerRect.x + footerRect.width, footerRect.y + footerRect.height);
  ctx.restore();
}

/**
 * Pure synchronous canvas drawing routine for the editorial poster.
 * Designed so Phase 7 video export can also call `drawPoster` or reuse sections on video frames.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ coverImage?: CanvasImageSource | null, mascotWorld?: ReturnType<typeof createWorld> | null }} data
 * @param {ReturnType<typeof computePosterLayout>} layout
 * @param {Record<string, any>} rawTheme
 */
export function drawPoster(ctx, data, layout, rawTheme) {
  if (!ctx || !layout) {
    throw new PosterExportError('CANVAS_UNAVAILABLE', 'Contexto 2D ou layout inválido para desenhar o pôster.');
  }

  const theme = normalizePosterTheme(rawTheme, layout.model?.palette);
  const safeData = data && typeof data === 'object' ? data : {};

  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  drawDeterministicGrain(ctx, layout.width, layout.height, theme, 2026);

  drawRoundedRectPath(
    ctx,
    layout.frameRect.x,
    layout.frameRect.y,
    layout.frameRect.width,
    layout.frameRect.height,
    12
  );
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderStrong;
  ctx.stroke();

  drawHeaderSection(ctx, layout, theme);
  drawCoverSection(ctx, layout.coverRect, safeData, layout, theme);
  drawTitleAndSpecsSection(ctx, layout, theme);
  drawScoreAndVerdictSection(ctx, layout, theme);
  drawCriteriaBarsSection(ctx, layout, theme);
  drawMascotsBand(ctx, safeData, layout, theme);
  drawFooterSection(ctx, layout, theme);
  ctx.restore();
}

/**
 * Resolves a local same-origin Blob for the work's cover without ever touching external http(s) URLs.
 * @param {Record<string, any>} work
 * @param {{ db?: any, coverBlob?: Blob | null, fetchFn?: typeof fetch }} [options]
 */
export async function resolveSafeCoverBlob(work, options = {}) {
  if (options.coverBlob instanceof Blob) {
    return { blob: options.coverBlob, warning: null };
  }

  const coverRef = typeof work?.cover === 'string' ? work.cover.trim() : '';
  if (!coverRef) {
    return { blob: null, warning: null };
  }

  if (coverRef.startsWith('cover:')) {
    if (!options.db) {
      return {
        blob: null,
        warning: 'Banco local indisponível para carregar a capa; usando placeholder editorial.'
      };
    }
    try {
      const stored = await options.db.get(STORES.COVERS, coverRef);
      if (stored instanceof Blob) {
        return { blob: stored, warning: null };
      }
      return {
        blob: null,
        warning: 'Capa não encontrada no armazenamento local; usando placeholder editorial.'
      };
    } catch {
      return {
        blob: null,
        warning: 'Não foi possível ler a capa local; usando placeholder editorial.'
      };
    }
  }

  if (!isSafeLocalCoverPath(coverRef)) {
    return {
      blob: null,
      warning: 'Referência de capa externa bloqueada por segurança (R2); usando placeholder editorial.'
    };
  }

  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { blob: null, warning: 'Fetch local indisponível; usando placeholder editorial.' };
  }

  try {
    const response = await fetchFn(coverRef, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return { blob: blob instanceof Blob ? blob : null, warning: null };
  } catch {
    return {
      blob: null,
      warning: 'Falha ao carregar imagem local da capa; usando placeholder editorial.'
    };
  }
}

export async function decodeLocalCoverBitmap(blob, options = {}) {
  if (!blob) {
    return { source: null, close: () => {}, warning: null };
  }
  if (typeof options.decodeBlob === 'function') {
    try {
      const decoded = await options.decodeBlob(blob);
      if (decoded && decoded.source) {
        return {
          source: decoded.source,
          close: typeof decoded.close === 'function' ? decoded.close : () => decoded.source?.close?.(),
          warning: null
        };
      }
    } catch {
      return {
        source: null,
        close: () => {},
        warning: 'Falha ao decodificar capa local; usando placeholder editorial.'
      };
    }
  }

  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob);
      return {
        source: bitmap,
        close: () => bitmap.close?.(),
        warning: null
      };
    } catch {
      return {
        source: null,
        close: () => {},
        warning: 'Falha ao decodificar capa local; usando placeholder editorial.'
      };
    }
  }

  return {
    source: null,
    close: () => {},
    warning: 'Decodificador de bitmap indisponível; usando placeholder editorial.'
  };
}

function encodeCanvasToPngBlob(canvas, timeoutMs = DEFAULT_TOBLOB_TIMEOUT_MS) {
  if (!canvas || typeof canvas.toBlob !== 'function') {
    return Promise.reject(new PosterExportError('CANVAS_UNAVAILABLE', 'Canvas não suporta exportação PNG.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new PosterExportError('EXPORT_TIMEOUT', 'Tempo esgotado ao gerar arquivo PNG do pôster.'));
    }, timeoutMs);

    try {
      canvas.toBlob((blob) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (!blob) {
          reject(new PosterExportError('BLOB_EMPTY', 'O navegador retornou um PNG vazio (possível falta de memória).'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    } catch (err) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const isTainted = err?.name === 'SecurityError';
      reject(
        new PosterExportError(
          isTainted ? 'TAINTED_CANVAS' : 'DRAW_FAILED',
          isTainted
            ? 'Canvas bloqueado por política de origem ao exportar PNG.'
            : err?.message || 'Erro inesperado ao codificar pôster PNG.',
          err
        )
      );
    }
  });
}

// Only the 4 active criteria (plus the overall score) feed the mascots; legacy keys are ignored.
function buildDeterministicMascotWorld(work, palette) {
  const world = createWorld({ seed: 2026 });
  const scores = {};
  for (const key of CRITERIA_KEYS) {
    scores[key] = finiteOr(work?.scores?.[key], 0);
  }
  const geral = finiteOr(work?.scores?.geral, 0);
  scores.geral = geral;
  setInputs(world, {
    contextKind: 'poster',
    title: work?.title || '',
    scores,
    palette,
    savedPulse: geral >= 9.0
  });
  for (let i = 0; i < MASCOT_PREROLL_STEPS; i += 1) {
    advance(world, FIXED_DT);
  }
  return world;
}

/**
 * Renders an editorial 1080x1350 PNG poster for a CANON work.
 * @param {Record<string, any>} work
 * @param {Record<string, any>} theme
 * @param {{
 *   db?: any,
 *   coverBlob?: Blob | null,
 *   fetchFn?: typeof fetch,
 *   decodeBlob?: (blob: Blob) => Promise<{ source: any, close?: () => void }>,
 *   createCanvas?: (w: number, h: number) => HTMLCanvasElement,
 *   ensureFontsFn?: () => Promise<unknown>,
 *   showMascots?: boolean,
 *   timeoutMs?: number
 * }} [options]
 */
export async function renderPoster(work, theme, options = {}) {
  if (!work || typeof work !== 'object') {
    throw new PosterExportError('INVALID_WORK', 'Nenhuma obra válida informada para gerar o pôster.');
  }

  const showMascots = options.showMascots !== false;
  const resolvedTheme = normalizePosterTheme(theme, work.palette);

  // Editorial fonts must be ready before text is measured (layout) or drawn (canvas).
  await (typeof options.ensureFontsFn === 'function' ? options.ensureFontsFn() : ensureEditorialFonts());

  const canvas =
    typeof options.createCanvas === 'function'
      ? options.createCanvas(POSTER_WIDTH, POSTER_HEIGHT)
      : globalThis.document?.createElement?.('canvas');

  if (!canvas) {
    throw new PosterExportError('CANVAS_UNAVAILABLE', 'Não foi possível criar o canvas do pôster.');
  }

  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    throw new PosterExportError('CANVAS_UNAVAILABLE', 'Contexto Canvas 2D indisponível neste dispositivo.');
  }

  const measure = (text, fontSize, fontSpec) => {
    ctx.font = fontSpec;
    const width = ctx.measureText?.(text)?.width;
    return Number.isFinite(width) ? width : String(text || '').length * fontSize * 0.56;
  };

  const layout = computePosterLayout(work, {
    measure,
    fonts: resolvedTheme.fonts,
    showMascots
  });

  const normalizedPalette = layout.model.palette;
  const finalTheme = normalizePosterTheme(theme, normalizedPalette);

  const coverLookup = await resolveSafeCoverBlob(work, options);
  const decodedCover = await decodeLocalCoverBitmap(coverLookup.blob, options);
  const warning = coverLookup.warning || decodedCover.warning || null;

  const mascotWorld = showMascots ? buildDeterministicMascotWorld(work, normalizedPalette) : null;

  try {
    drawPoster(
      ctx,
      {
        coverImage: decodedCover.source,
        mascotWorld
      },
      layout,
      finalTheme
    );

    const blob = await encodeCanvasToPngBlob(canvas, options.timeoutMs);
    return {
      canvas,
      blob,
      layout,
      warning
    };
  } catch (err) {
    if (err instanceof PosterExportError) {
      throw err;
    }
    throw new PosterExportError(
      err?.name === 'SecurityError' ? 'TAINTED_CANVAS' : 'DRAW_FAILED',
      err?.message || 'Erro ao desenhar ou exportar o pôster.',
      err
    );
  } finally {
    decodedCover.close();
  }
}

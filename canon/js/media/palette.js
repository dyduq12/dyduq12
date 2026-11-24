/**
 * Pure 2-color palette quantizer (Node-testable) plus thin 32x32 canvas browser reader.
 */

import { DEFAULT_PALETTE, isValidPaletteColor } from '../core/schema.js';

const PURE_DARK_INT = 0;
const PURE_LIGHT_INT = 16777215;
const MIN_ALPHA = 128;
const NEAR_DARK_THRESHOLD = 22;
const NEAR_LIGHT_THRESHOLD = 233;
const MIN_COLOR_DISTANCE_SQ = 48 * 48;

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToSafeHex(r, g, b) {
  let cr = clampByte(r);
  let cg = clampByte(g);
  let cb = clampByte(b);

  const numeric = (cr << 16) + (cg << 8) + cb;
  if (numeric === PURE_DARK_INT) {
    cr = 18;
    cg = 18;
    cb = 22;
  } else if (numeric === PURE_LIGHT_INT) {
    cr = 238;
    cg = 236;
    cb = 230;
  }

  const hex = `#${cr.toString(16).padStart(2, '0')}${cg.toString(16).padStart(2, '0')}${cb.toString(16).padStart(2, '0')}`.toUpperCase();
  return isValidPaletteColor(hex) ? hex : DEFAULT_PALETTE[0];
}

function isNearExtreme(r, g, b) {
  const isNearDark = r <= NEAR_DARK_THRESHOLD && g <= NEAR_DARK_THRESHOLD && b <= NEAR_DARK_THRESHOLD;
  const isNearLight = r >= NEAR_LIGHT_THRESHOLD && g >= NEAR_LIGHT_THRESHOLD && b >= NEAR_LIGHT_THRESHOLD;
  return isNearDark || isNearLight;
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function computeSecondaryShift(primary) {
  const shift = primary.r + primary.g + primary.b > 380 ? -52 : 52;
  return {
    r: clampByte(primary.r + shift),
    g: clampByte(primary.g + Math.round(shift * 0.7)),
    b: clampByte(primary.b + Math.round(shift * 0.4))
  };
}

function bucketPixels(rgbaPixels, ignoreExtremes) {
  /** @type {Map<number, { count: number, rSum: number, gSum: number, bSum: number, chromaSum: number }>} */
  const buckets = new Map();

  for (let i = 0; i + 3 < rgbaPixels.length; i += 4) {
    const r = rgbaPixels[i];
    const g = rgbaPixels[i + 1];
    const b = rgbaPixels[i + 2];
    const a = rgbaPixels[i + 3];

    if (a < MIN_ALPHA) {
      continue;
    }
    if (ignoreExtremes && isNearExtreme(r, g, b)) {
      continue;
    }

    const qr = r >> 4;
    const qg = g >> 4;
    const qb = b >> 4;
    const key = (qr << 8) | (qg << 4) | qb;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, rSum: 0, gSum: 0, bSum: 0, chromaSum: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.rSum += r;
    bucket.gSum += g;
    bucket.bSum += b;
    bucket.chromaSum += chroma;
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const r = bucket.rSum / bucket.count;
      const g = bucket.gSum / bucket.count;
      const b = bucket.bSum / bucket.count;
      const avgChroma = bucket.chromaSum / bucket.count;
      const score = bucket.count * (1 + avgChroma / 128);
      return { r, g, b, count: bucket.count, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Pure palette extractor: accepts RGBA pixel data and returns 2 non-extreme hex colors.
 * @param {Uint8ClampedArray | number[]} rgbaPixels
 * @returns {[string, string]}
 */
export function extractPaletteFromPixels(rgbaPixels) {
  if (!rgbaPixels || rgbaPixels.length < 4) {
    return [...DEFAULT_PALETTE];
  }

  let candidates = bucketPixels(rgbaPixels, true);
  if (candidates.length === 0) {
    candidates = bucketPixels(rgbaPixels, false);
  }
  if (candidates.length === 0) {
    return [...DEFAULT_PALETTE];
  }

  const primary = candidates[0];
  let secondary = candidates.find((c) => colorDistanceSq(primary, c) >= MIN_COLOR_DISTANCE_SQ);
  if (!secondary) {
    secondary = candidates[1] && colorDistanceSq(primary, candidates[1]) > 0
      ? candidates[1]
      : computeSecondaryShift(primary);
  }

  const hex1 = rgbToSafeHex(primary.r, primary.g, primary.b);
  let hex2 = rgbToSafeHex(secondary.r, secondary.g, secondary.b);
  if (hex2 === hex1) {
    const shifted = computeSecondaryShift(primary);
    hex2 = rgbToSafeHex(shifted.r, shifted.g, shifted.b);
  }

  return [hex1, hex2];
}

/**
 * Browser-only helper: draws a decoded same-origin image source onto a 32x32 canvas and extracts 2 colors.
 * Wraps getImageData in try/catch to guard against tainted canvases.
 * @param {CanvasImageSource} imageSource
 * @param {number} [sampleSize]
 * @returns {{ ok: boolean, palette: [string, string], error: string | null }}
 */
export function extractPaletteFromImageSource(imageSource, sampleSize = 32) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        ok: false,
        palette: [...DEFAULT_PALETTE],
        error: 'Contexto 2D indisponível para extrair paleta.'
      };
    }

    ctx.drawImage(imageSource, 0, 0, sampleSize, sampleSize);
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const palette = extractPaletteFromPixels(imageData.data);
    return { ok: true, palette, error: null };
  } catch (err) {
    console.warn('[palette.extractPaletteFromImageSource] Falha ao ler pixels do canvas:', {
      name: err?.name,
      message: err?.message
    });
    return {
      ok: false,
      palette: [...DEFAULT_PALETTE],
      error: 'Não foi possível extrair a paleta da imagem (canvas protegido ou erro de leitura).'
    };
  }
}

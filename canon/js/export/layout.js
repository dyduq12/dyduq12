/**
 * Pure deterministic layout calculator for the 1080x1350 editorial PNG poster.
 * Zero DOM, zero canvas creation, zero literal colors.
 */

import { buildCardModel } from '../ui/card-model.js';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;
export const POSTER_MARGIN = 64;

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_MARGIN = 64;
export const VIDEO_SAFE_TOP = 250;
export const VIDEO_SAFE_BOTTOM = 250;

const INNER_WIDTH = POSTER_WIDTH - POSTER_MARGIN * 2;
const VIDEO_INNER_WIDTH = VIDEO_WIDTH - VIDEO_MARGIN * 2;
const DEFAULT_FONTS = Object.freeze({
  condensed: '"Big Shoulders Display", "Bahnschrift", "DIN Condensed", "Arial Narrow", system-ui, sans-serif',
  body: '"Source Serif 4", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace'
});

function sanitizeMeasureFn(measure) {
  if (typeof measure === 'function') {
    return measure;
  }
  return (text, fontSize) => String(text || '').length * fontSize * 0.56;
}

/**
 * Splits `count` criteria rows (4 active criteria) inside `areaHeight` with `count - 1` gaps between rows.
 * @param {number} areaHeight
 * @param {number} count
 * @param {number} rowGap
 */
function computeBarRowHeight(areaHeight, count, rowGap) {
  const rows = Math.max(1, count);
  return Math.max(0, Math.floor((areaHeight - rowGap * (rows - 1)) / rows));
}

function splitLongToken(token, measure, fontSpec, fontSize, maxWidth) {
  const chars = Array.from(token);
  const chunks = [];
  let current = '';

  for (const ch of chars) {
    const next = current + ch;
    if (current.length > 0 && measure(next, fontSize, fontSpec) > maxWidth) {
      chunks.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Pure text wrapping helper using an injected measurement function.
 * Handles spaces, punctuation, emoji, and oversized unspaced tokens without exceeding `maxWidth`.
 * @param {{
 *   text: string,
 *   measure: (line: string, fontSize: number, fontSpec: string) => number,
 *   fontFamily: string,
 *   fontWeight?: number | string,
 *   fontSize: number,
 *   maxWidth: number,
 *   maxLines?: number
 * }} params
 */
export function wrapTextLines({
  text,
  measure,
  fontFamily,
  fontWeight = 700,
  fontSize,
  maxWidth,
  maxLines = 3
}) {
  const measureFn = sanitizeMeasureFn(measure);
  const cleanText = String(text ?? '').replace(/\s+/g, ' ').trim();
  const fontSpec = `${fontWeight} ${fontSize}px ${fontFamily}`;

  if (!cleanText) {
    return { lines: [''], truncated: false, overflowed: false, fontSpec };
  }

  const rawWords = cleanText.split(' ');
  const tokens = [];
  for (const word of rawWords) {
    if (measureFn(word, fontSize, fontSpec) > maxWidth) {
      tokens.push(...splitLongToken(word, measureFn, fontSpec, fontSize, maxWidth));
    } else {
      tokens.push(word);
    }
  }

  const lines = [];
  let currentLine = '';

  for (const token of tokens) {
    const candidate = currentLine ? `${currentLine} ${token}` : token;
    if (!currentLine || measureFn(candidate, fontSize, fontSpec) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = token;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  let truncated = false;
  const overflowed = lines.length > maxLines;
  const clampedLines = lines.slice(0, maxLines);

  if (overflowed && clampedLines.length > 0) {
    truncated = true;
    const ellipsis = '…';
    let last = clampedLines[clampedLines.length - 1];
    const chars = Array.from(last);
    while (chars.length > 1 && measureFn(`${chars.join('')}${ellipsis}`, fontSize, fontSpec) > maxWidth) {
      chars.pop();
    }
    clampedLines[clampedLines.length - 1] = `${chars.join('').trimEnd()}${ellipsis}`;
  }

  return {
    lines: clampedLines,
    truncated,
    overflowed,
    fontSpec
  };
}

/**
 * Finds the largest font size between `minFontSize` and `maxFontSize` that fits within `maxLines`
 * and optional `maxHeight`, falling back cleanly with ellipsis only if needed at `minFontSize`.
 */
export function fitTextBlock({
  text,
  measure,
  fontFamily,
  fontWeight = 800,
  maxWidth,
  maxLines = 3,
  maxFontSize = 72,
  minFontSize = 28,
  lineHeightRatio = 1.06,
  maxHeight = Number.POSITIVE_INFINITY
}) {
  const safeMin = Math.max(12, Math.round(minFontSize));
  const safeMax = Math.max(safeMin, Math.round(maxFontSize));

  for (let size = safeMax; size >= safeMin; size -= 2) {
    const wrapped = wrapTextLines({
      text,
      measure,
      fontFamily,
      fontWeight,
      fontSize: size,
      maxWidth,
      maxLines
    });
    const lineHeight = Math.round(size * lineHeightRatio);
    const totalHeight = wrapped.lines.length * lineHeight;
    if (!wrapped.overflowed && totalHeight <= maxHeight) {
      return {
        fontSize: size,
        lineHeight,
        totalHeight,
        lines: wrapped.lines,
        truncated: false,
        fontSpec: wrapped.fontSpec
      };
    }
  }

  const fallback = wrapTextLines({
    text,
    measure,
    fontFamily,
    fontWeight,
    fontSize: safeMin,
    maxWidth,
    maxLines
  });
  const lineHeight = Math.round(safeMin * lineHeightRatio);
  return {
    fontSize: safeMin,
    lineHeight,
    totalHeight: fallback.lines.length * lineHeight,
    lines: fallback.lines,
    truncated: fallback.truncated,
    fontSpec: fallback.fontSpec
  };
}

/**
 * Resolves font strings from options without any CSS var() references.
 */
export function resolvePosterFonts(fonts = {}) {
  const pick = (val, fallback) => {
    if (typeof val !== 'string') {
      return fallback;
    }
    const trimmed = val.trim();
    return trimmed.length > 0 && !trimmed.includes('var(') ? trimmed : fallback;
  };
  return {
    condensed: pick(fonts.condensed, DEFAULT_FONTS.condensed),
    body: pick(fonts.body, DEFAULT_FONTS.body),
    mono: pick(fonts.mono, DEFAULT_FONTS.mono)
  };
}

/**
 * Computes all geometry, typography fits, and non-overlapping editorial zones inside 1080x1350.
 * @param {Record<string, any>} work
 * @param {{
 *   measure?: (text: string, fontSize: number, fontSpec: string) => number,
 *   fonts?: Partial<typeof DEFAULT_FONTS>,
 *   showMascots?: boolean
 * }} [options]
 */
export function computePosterLayout(work, options = {}) {
  const model = buildCardModel(work);
  const fonts = resolvePosterFonts(options.fonts);
  const measure = sanitizeMeasureFn(options.measure);
  const showMascots = options.showMascots !== false;

  const frameRect = {
    x: 28,
    y: 28,
    width: POSTER_WIDTH - 56,
    height: POSTER_HEIGHT - 56
  };

  const headerRect = {
    x: POSTER_MARGIN,
    y: 56,
    width: INNER_WIDTH,
    height: 52
  };

  // Hero split: 2:3 cover on left + editorial title/specs on right
  const heroTop = 128;
  const heroHeight = 510;
  const coverRect = {
    x: POSTER_MARGIN,
    y: heroTop,
    width: 340,
    height: heroHeight
  };

  const rightX = coverRect.x + coverRect.width + 36;
  const rightWidth = POSTER_MARGIN + INNER_WIDTH - rightX;

  const titleBox = {
    x: rightX,
    y: heroTop,
    width: rightWidth,
    maxHeight: 230
  };

  const titleFit = fitTextBlock({
    text: model.titleUpper,
    measure,
    fontFamily: fonts.condensed,
    fontWeight: 800,
    maxWidth: titleBox.width,
    maxLines: 3,
    maxFontSize: 70,
    minFontSize: 30,
    lineHeightRatio: 1.05,
    maxHeight: titleBox.maxHeight
  });

  const titleRect = {
    x: titleBox.x,
    y: titleBox.y,
    width: titleBox.width,
    height: titleFit.totalHeight
  };

  const specsTop = titleRect.y + Math.max(titleRect.height, 84) + 24;
  const specsBottom = heroTop + heroHeight;
  const specsRect = {
    x: rightX,
    y: specsTop,
    width: rightWidth,
    height: Math.max(120, specsBottom - specsTop)
  };

  const specRowHeight = Math.min(54, Math.floor(specsRect.height / Math.max(1, model.techSpecs.length)));
  const specsRows = model.techSpecs.map((spec, index) => {
    const valueFit = fitTextBlock({
      text: spec.value,
      measure,
      fontFamily: fonts.body,
      fontWeight: 600,
      maxWidth: specsRect.width,
      maxLines: 1,
      maxFontSize: 21,
      minFontSize: 16,
      lineHeightRatio: 1.15
    });
    return {
      label: spec.label,
      value: valueFit.lines[0],
      fontSpec: valueFit.fontSpec,
      fontSize: valueFit.fontSize,
      x: specsRect.x,
      y: specsRect.y + index * specRowHeight,
      width: specsRect.width,
      height: specRowHeight
    };
  });

  const scoreRect = {
    x: POSTER_MARGIN,
    y: 668,
    width: INNER_WIDTH,
    height: 148
  };

  const scoreValueRect = {
    x: scoreRect.x + 24,
    y: scoreRect.y + 18,
    width: 240,
    height: 112
  };

  const badgeWidth = 228;
  const badgeRect = model.hallOfFame.isHallOfFame
    ? {
        x: scoreRect.x + scoreRect.width - badgeWidth - 20,
        y: scoreRect.y + 22,
        width: badgeWidth,
        height: 46
      }
    : null;

  const verdictWidth = badgeRect
    ? scoreRect.width - 280 - badgeWidth - 36
    : scoreRect.width - 280 - 24;

  const verdictFit = fitTextBlock({
    text: model.verdictText,
    measure,
    fontFamily: fonts.body,
    fontWeight: 500,
    maxWidth: Math.max(180, verdictWidth),
    maxLines: 3,
    maxFontSize: 22,
    minFontSize: 16,
    lineHeightRatio: 1.25
  });

  const verdictRect = {
    x: scoreRect.x + 268,
    y: scoreRect.y + 24,
    width: Math.max(180, verdictWidth),
    height: verdictFit.totalHeight
  };

  const footerRect = {
    x: POSTER_MARGIN,
    y: 1272,
    width: INNER_WIDTH,
    height: 30
  };

  const mascotRect = showMascots
    ? {
        x: POSTER_MARGIN,
        y: 1106,
        width: INNER_WIDTH,
        height: 142
      }
    : null;

  const barsBottom = mascotRect ? mascotRect.y - 24 : footerRect.y - 28;
  const barsRect = {
    x: POSTER_MARGIN,
    y: 840,
    width: INNER_WIDTH,
    height: barsBottom - 840
  };

  // 4 criteria rows with 3 gaps between them
  const rowGap = 10;
  const barRowHeight = computeBarRowHeight(barsRect.height, model.criteriaBars.length, rowGap);
  const bars = model.criteriaBars.map((bar, index) => ({
    ...bar,
    x: barsRect.x,
    y: barsRect.y + index * (barRowHeight + rowGap),
    width: barsRect.width,
    height: barRowHeight
  }));

  return {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    margin: POSTER_MARGIN,
    model,
    fonts,
    showMascots,
    frameRect,
    headerRect,
    coverRect,
    titleRect,
    titleFit,
    specsRect,
    specsRows,
    scoreRect,
    scoreValueRect,
    badgeRect,
    verdictRect,
    verdictFit,
    barsRect,
    bars,
    mascotRect,
    footerRect
  };
}

/**
 * Pure deterministic vertical 1080x1920 layout calculator for MP4 story video frames.
 * Reserves >= 250px safe margins at top and bottom and guarantees strictly disjoint rectangles.
 * @param {Record<string, any>} work
 * @param {{
 *   measure?: (text: string, fontSize: number, fontSpec: string) => number,
 *   fonts?: Partial<typeof DEFAULT_FONTS>,
 *   showMascots?: boolean
 * }} [options]
 */
export function computeVideoLayout(work, options = {}) {
  const model = buildCardModel(work);
  const fonts = resolvePosterFonts(options.fonts);
  const measure = sanitizeMeasureFn(options.measure);
  const showMascots = options.showMascots !== false;

  const usableTop = VIDEO_SAFE_TOP;
  const usableBottom = VIDEO_HEIGHT - VIDEO_SAFE_BOTTOM;

  const frameRect = {
    x: 28,
    y: usableTop,
    width: VIDEO_WIDTH - 56,
    height: usableBottom - usableTop
  };

  const headerRect = {
    x: VIDEO_MARGIN,
    y: usableTop + 24,
    width: VIDEO_INNER_WIDTH,
    height: 48
  };

  const heroTop = headerRect.y + headerRect.height + 20;
  const heroHeight = 450;
  const coverRect = {
    x: VIDEO_MARGIN,
    y: heroTop,
    width: 300,
    height: heroHeight
  };

  const rightX = coverRect.x + coverRect.width + 36;
  const rightWidth = VIDEO_MARGIN + VIDEO_INNER_WIDTH - rightX;

  const titleFit = fitTextBlock({
    text: model.titleUpper,
    measure,
    fontFamily: fonts.condensed,
    fontWeight: 800,
    maxWidth: rightWidth,
    maxLines: 3,
    maxFontSize: 64,
    minFontSize: 28,
    lineHeightRatio: 1.05,
    maxHeight: 204
  });

  const titleRect = {
    x: rightX,
    y: heroTop,
    width: rightWidth,
    height: Math.min(204, titleFit.totalHeight)
  };

  const specsTop = titleRect.y + Math.max(titleRect.height, 80) + 22;
  const specsBottom = heroTop + heroHeight;
  const specsRect = {
    x: rightX,
    y: specsTop,
    width: rightWidth,
    height: Math.max(110, specsBottom - specsTop)
  };

  const specRowHeight = Math.min(48, Math.floor(specsRect.height / Math.max(1, model.techSpecs.length)));
  const specsRows = model.techSpecs.map((spec, index) => {
    const valueFit = fitTextBlock({
      text: spec.value,
      measure,
      fontFamily: fonts.body,
      fontWeight: 600,
      maxWidth: specsRect.width,
      maxLines: 1,
      maxFontSize: 20,
      minFontSize: 15,
      lineHeightRatio: 1.15
    });
    return {
      label: spec.label,
      value: valueFit.lines[0],
      fontSpec: valueFit.fontSpec,
      fontSize: valueFit.fontSize,
      x: specsRect.x,
      y: specsRect.y + index * specRowHeight,
      width: specsRect.width,
      height: specRowHeight
    };
  });

  const scoreRect = {
    x: VIDEO_MARGIN,
    y: heroTop + heroHeight + 24,
    width: VIDEO_INNER_WIDTH,
    height: 152
  };

  const scoreValueRect = {
    x: scoreRect.x + 24,
    y: scoreRect.y + 18,
    width: 240,
    height: 116
  };

  const badgeWidth = 228;
  const badgeRect = model.hallOfFame.isHallOfFame
    ? {
        x: scoreRect.x + scoreRect.width - badgeWidth - 20,
        y: scoreRect.y + 22,
        width: badgeWidth,
        height: 46
      }
    : null;

  const verdictWidth = badgeRect
    ? scoreRect.width - 280 - badgeWidth - 36
    : scoreRect.width - 280 - 24;

  const verdictFit = fitTextBlock({
    text: model.verdictText,
    measure,
    fontFamily: fonts.body,
    fontWeight: 500,
    maxWidth: Math.max(180, verdictWidth),
    maxLines: 3,
    maxFontSize: 22,
    minFontSize: 16,
    lineHeightRatio: 1.25
  });

  const verdictRect = {
    x: scoreRect.x + 268,
    y: scoreRect.y + 24,
    width: Math.max(180, verdictWidth),
    height: verdictFit.totalHeight
  };

  const footerRect = {
    x: VIDEO_MARGIN,
    y: usableBottom - 52,
    width: VIDEO_INNER_WIDTH,
    height: 32
  };

  const mascotRect = showMascots
    ? {
        x: VIDEO_MARGIN,
        y: footerRect.y - 22 - 224,
        width: VIDEO_INNER_WIDTH,
        height: 224
      }
    : null;

  const barsTop = scoreRect.y + scoreRect.height + 24;
  const barsBottom = mascotRect ? mascotRect.y - 24 : footerRect.y - 24;
  const barsRect = {
    x: VIDEO_MARGIN,
    y: barsTop,
    width: VIDEO_INNER_WIDTH,
    height: Math.max(260, Math.min(356, barsBottom - barsTop))
  };

  // 4 criteria rows with 3 gaps between them
  const rowGap = 12;
  const barRowHeight = computeBarRowHeight(barsRect.height, model.criteriaBars.length, rowGap);
  const bars = model.criteriaBars.map((bar, index) => ({
    ...bar,
    x: barsRect.x,
    y: barsRect.y + index * (barRowHeight + rowGap),
    width: barsRect.width,
    height: barRowHeight
  }));

  return {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    margin: VIDEO_MARGIN,
    safeTop: VIDEO_SAFE_TOP,
    safeBottom: VIDEO_SAFE_BOTTOM,
    model,
    fonts,
    showMascots,
    frameRect,
    headerRect,
    coverRect,
    titleRect,
    titleFit,
    specsRect,
    specsRows,
    scoreRect,
    scoreValueRect,
    badgeRect,
    verdictRect,
    verdictFit,
    barsRect,
    bars,
    mascotRect,
    footerRect
  };
}

/**
 * Frame-by-frame 1080x1920 vertical story renderer for MP4 video export.
 * Reuses safe cover loading (R2), seeded grain, theme normalization, and mascot world drawing.
 * Zero unseeded randomness, zero wall clocks, zero DOM string injection, zero literal colors.
 */

import {
  FIXED_DT,
  advance,
  createWorld,
  drawWorld,
  setInputs
} from '../mascots/engine.js';
import { VIDEO_HEIGHT, VIDEO_WIDTH, computeVideoLayout } from './layout.js';
import {
  decodeLocalCoverBitmap,
  drawDeterministicGrain,
  drawRoundedRectPath,
  normalizePosterTheme,
  resolveSafeCoverBlob
} from './poster.js';

const GRAIN_SEED_VIDEO = 2026;

function finiteOr(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteOr(value, 0)));
}

/**
 * Creates the deterministic mascot world configured for video export.
 * @param {Record<string, any>} work
 * @param {string[]} [palette]
 */
export function createVideoMascotWorld(work, palette) {
  const world = createWorld({ seed: GRAIN_SEED_VIDEO });
  setInputs(world, {
    contextKind: 'video',
    title: work?.title || '',
    scores: {
      ...(work?.scores || {}),
      geral: 5.5
    },
    palette: palette ?? work?.palette
  });
  return world;
}

/**
 * Applies timeline mascot inputs and advances the simulation deterministically.
 * At 30 fps, runs two 1/60s steps per frame so mascot spring physics matches 60 fps.
 *
 * @param {ReturnType<typeof createWorld>} world
 * @param {Record<string, any>} inputs
 * @param {number} fps
 * @param {number} frameIndex
 */
export function advanceMascotWorldForFrame(world, inputs, fps, frameIndex) {
  if (!world) {
    return null;
  }
  const safeInputs = inputs && typeof inputs === 'object' ? inputs : {};
  const wantPulse = safeInputs.savedPulse === true;
  const triggerPulse = wantPulse && !world._videoPulseActive;
  world._videoPulseActive = wantPulse;

  setInputs(world, {
    ...safeInputs,
    savedPulse: triggerPulse
  });
  if (frameIndex > 0) {
    const safeFps = finiteOr(fps, 60);
    const stepsPerFrame = safeFps <= 30 ? 2 : 1;
    for (let step = 0; step < stepsPerFrame; step += 1) {
      advance(world, FIXED_DT);
    }
  }
  return world;
}

function drawSafeZoneGuides(ctx, layout, theme) {
  const { frameRect, safeTop, width, height, safeBottom } = layout;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(frameRect.x, safeTop);
  ctx.lineTo(width - frameRect.x, safeTop);
  ctx.moveTo(frameRect.x, height - safeBottom);
  ctx.lineTo(width - frameRect.x, height - safeBottom);
  ctx.stroke();
  ctx.restore();
}

function drawVideoHeader(ctx, layout, theme, introAlpha) {
  const { headerRect, model } = layout;
  const slideY = (1 - introAlpha) * 14;

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, introAlpha);
  ctx.translate(0, slideY);

  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 18px ${theme.fonts.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('CANON · VEREDITO STORY', headerRect.x, headerRect.y + headerRect.height / 2);

  const pillText = `${model.typeLabel} · ${model.yearText}`;
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

function drawVideoCover(ctx, data, layout, theme, introAlpha) {
  const { coverRect, model } = layout;
  const { x, y, width, height } = coverRect;
  const offsetY = (1 - introAlpha) * 20;

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, introAlpha);
  ctx.translate(0, offsetY);

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
    ctx.globalAlpha = 0.22 * introAlpha;
    ctx.strokeStyle = theme.surface;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, y + height * 0.75);
    ctx.lineTo(x + width + 20, y + height * 0.25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = theme.surface;
    ctx.font = `800 76px ${theme.fonts.condensed}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(model.monogram || 'CN', x + width / 2, y + height / 2);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, introAlpha);
  ctx.translate(0, offsetY);
  drawRoundedRectPath(ctx, x, y, width, height, 10);
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderStrong;
  ctx.stroke();
  ctx.restore();
}

function drawVideoTitleAndSpecs(ctx, layout, theme, titleAlpha, specsAlpha) {
  const { titleRect, titleFit, specsRows } = layout;

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, titleAlpha);
  ctx.translate(0, (1 - titleAlpha) * 16);
  ctx.fillStyle = theme.text;
  ctx.font = titleFit.fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  titleFit.lines.forEach((line, index) => {
    ctx.fillText(line, titleRect.x, titleRect.y + index * titleFit.lineHeight);
  });

  const dividerY = titleRect.y + Math.max(titleRect.height, 80) + 10;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(titleRect.x, dividerY, Math.max(4, Math.round(96 * titleAlpha)), 5);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, specsAlpha);
  ctx.translate(0, (1 - specsAlpha) * 12);
  for (const row of specsRows) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = `700 13px ${theme.fonts.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(row.label, row.x, row.y);

    ctx.fillStyle = theme.text;
    ctx.font = row.fontSpec;
    ctx.fillText(row.value, row.x, row.y + 16);
  }
  ctx.restore();
}

function drawVideoScoreAndVerdict(ctx, layout, theme, state) {
  const { scoreRect, scoreValueRect, badgeRect, verdictRect, verdictFit, model } = layout;
  const scoreProg = clamp01(state.scoreProgress);
  const verdictProg = clamp01(state.verdictProgress);
  const badgeProg = state.isHallOfFame ? clamp01(state.badgeProgress) : 0;
  const displayedScore = Math.max(0, Math.min(10, finiteOr(state.currentGeralScore, 0)));

  ctx.save();
  drawRoundedRectPath(ctx, scoreRect.x, scoreRect.y, scoreRect.width, scoreRect.height, 10);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.border;
  ctx.stroke();

  ctx.fillStyle = theme.workB;
  ctx.fillRect(scoreRect.x, scoreRect.y + 12, 6, scoreRect.height - 24);

  const scoreText = displayedScore.toFixed(1);
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, scoreProg);
  ctx.fillStyle = theme.text;
  ctx.font = `800 66px ${theme.fonts.condensed}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(scoreText, scoreValueRect.x, scoreValueRect.y);

  const scoreWidth = finiteOr(ctx.measureText(scoreText).width, 92);
  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 22px ${theme.fonts.mono}`;
  ctx.fillText('/ 10', scoreValueRect.x + scoreWidth + 10, scoreValueRect.y + 12);

  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 15px ${theme.fonts.mono}`;
  ctx.fillText(`STATUS: ${model.statusLabel.toLocaleUpperCase('pt-BR')}`, scoreValueRect.x, scoreValueRect.y + 78);
  ctx.restore();

  if (badgeRect && model.hallOfFame.badgeLabel && badgeProg > 0) {
    ctx.save();
    ctx.globalAlpha = badgeProg;
    drawRoundedRectPath(ctx, badgeRect.x, badgeRect.y, badgeRect.width, badgeRect.height, 8);
    ctx.fillStyle = theme.accent;
    ctx.fill();

    ctx.fillStyle = theme.accentContrast;
    ctx.font = `800 17px ${theme.fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(model.hallOfFame.badgeLabel, badgeRect.x + badgeRect.width / 2, badgeRect.y + badgeRect.height / 2 + 1);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0.1, verdictProg);
  ctx.fillStyle = theme.text;
  ctx.font = verdictFit.fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  verdictFit.lines.forEach((line, index) => {
    ctx.fillText(line, verdictRect.x, verdictRect.y + index * verdictFit.lineHeight);
  });
  ctx.restore();

  ctx.restore();
}

function drawVideoCriteriaBars(ctx, layout, theme, state) {
  const animatedBars = Array.isArray(state.barsProgress) ? state.barsProgress : [];

  ctx.save();
  for (let i = 0; i < layout.bars.length; i += 1) {
    const bar = layout.bars[i];
    const anim = animatedBars[i];
    const ratio = anim ? clamp01(anim.ratio) : clamp01(finiteOr(bar.percent, 0) / 100);
    const currentScore = anim ? Math.max(0, Math.min(10, finiteOr(anim.currentScore, 0))) : finiteOr(bar.score, 0);

    const labelY = bar.y + 2;
    const trackY = bar.y + 24;
    const trackH = Math.max(12, Math.min(16, bar.height - 28));

    ctx.fillStyle = theme.text;
    ctx.font = `600 18px ${theme.fonts.body}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(bar.label, bar.x, labelY);

    ctx.fillStyle = theme.text;
    ctx.font = `700 18px ${theme.fonts.mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(currentScore.toFixed(1), bar.x + bar.width, labelY);

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

function drawVideoMascotsBand(ctx, data, layout, theme) {
  if (!layout.mascotRect || !data.mascotWorld) {
    return;
  }
  const rect = layout.mascotRect;
  const worldHeight = Math.max(96, rect.height - 34);

  ctx.save();
  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.border;
  ctx.stroke();
  ctx.clip();

  ctx.save();
  ctx.translate(rect.x, rect.y + 4);
  drawWorld(ctx, data.mascotWorld, { width: rect.width, height: worldHeight }, theme.mascot);
  ctx.restore();

  const names = ['KOMA', 'SAVE', 'KINO', 'ECHO'];
  const cellW = rect.width / 4;
  ctx.fillStyle = theme.textMuted;
  ctx.font = `700 14px ${theme.fonts.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  names.forEach((name, idx) => {
    ctx.fillText(name, rect.x + cellW * idx + cellW / 2, rect.y + rect.height - 8);
  });

  ctx.restore();
}

function drawVideoFooter(ctx, layout, theme, state) {
  const { footerRect } = layout;
  const progressRatio = clamp01(finiteOr(state.t, 0) / Math.max(0.1, finiteOr(state.duration, 7)));

  ctx.save();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(footerRect.x, footerRect.y);
  ctx.lineTo(footerRect.x + footerRect.width, footerRect.y);
  ctx.stroke();

  ctx.fillStyle = theme.accent;
  ctx.fillRect(footerRect.x, footerRect.y - 1, Math.round(footerRect.width * progressRatio), 3);

  ctx.fillStyle = theme.textMuted;
  ctx.font = `600 14px ${theme.fonts.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('CANON · ACERVO EDITORIAL PESSOAL', footerRect.x, footerRect.y + footerRect.height);

  ctx.textAlign = 'right';
  ctx.fillText('1080×1920 · STORY', footerRect.x + footerRect.width, footerRect.y + footerRect.height);
  ctx.restore();
}

/**
 * Renders a single deterministic 1080x1920 frame onto `ctx` at the given timeline `state`.
 * Uses only theme tokens, already-decoded same-origin cover bitmaps, and Canvas 2D primitives.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ coverImage?: CanvasImageSource | null, mascotWorld?: ReturnType<typeof createWorld> | null }} data
 * @param {ReturnType<typeof computeVideoLayout>} layout
 * @param {Record<string, any>} rawTheme
 * @param {Record<string, any>} [state]
 */
export function drawFrame(ctx, data, layout, rawTheme, state = {}) {
  if (!ctx || !layout) {
    throw new Error('Contexto 2D ou layout inválido para desenhar quadro de vídeo.');
  }

  const theme = normalizePosterTheme(rawTheme, layout.model?.palette);
  const safeData = data && typeof data === 'object' ? data : {};
  const safeState = state && typeof state === 'object' ? state : {};
  const outroFade = 1 - clamp01(safeState.outroProgress) * 0.08;

  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, layout.width || VIDEO_WIDTH, layout.height || VIDEO_HEIGHT);

  drawDeterministicGrain(ctx, layout.width || VIDEO_WIDTH, layout.height || VIDEO_HEIGHT, theme, GRAIN_SEED_VIDEO);
  drawSafeZoneGuides(ctx, layout, theme);

  ctx.globalAlpha = outroFade;
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

  const introAlpha = clamp01(safeState.introProgress ?? 1);
  const titleAlpha = clamp01(safeState.titleProgress ?? 1);
  const specsAlpha = clamp01(safeState.specsProgress ?? 1);

  drawVideoHeader(ctx, layout, theme, introAlpha);
  drawVideoCover(ctx, safeData, layout, theme, introAlpha);
  drawVideoTitleAndSpecs(ctx, layout, theme, titleAlpha, specsAlpha);
  drawVideoScoreAndVerdict(ctx, layout, theme, safeState);
  drawVideoCriteriaBars(ctx, layout, theme, safeState);
  drawVideoMascotsBand(ctx, safeData, layout, theme);
  drawVideoFooter(ctx, layout, theme, safeState);
  ctx.restore();
}

export {
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  computeVideoLayout,
  decodeLocalCoverBitmap,
  resolveSafeCoverBlob
};

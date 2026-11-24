/**
 * Pure deterministic animation & audio timeline builder for 1080x1920 MP4 export (~7 s).
 * Single source of truth for both visual frame state (`stateAt(t)`) and offline audio (`audioEvents`).
 * Zero DOM, deterministic pure functions, zero unseeded PRNG, zero wall-clock APIs, zero literal colors.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { HALL_OF_FAME_THRESHOLD, buildCardModel } from '../ui/card-model.js';

export const VIDEO_DURATION_SEC = 7.0;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function finiteOr(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function easeOutCubic(u) {
  const x = clamp01(u);
  return 1 - (1 - x) ** 3;
}

function windowProgress(t, start, end) {
  if (!Number.isFinite(t) || end <= start) {
    return t >= end ? 1 : 0;
  }
  return clamp01((t - start) / (end - start));
}

function roundTime(t) {
  return Math.round(t * 10000) / 10000;
}

/**
 * Builds a deterministic, read-only timeline for a CANON work.
 * Structure scaled smoothly to `duration` (default 7.0 s):
 * - 0.0..1.0 s: intro (cover, title, tech specs) + shutter sound
 * - 1.0..5.0 s: progressive fill of the 5 criteria bars + synced ticks
 * - 5.0..7.0 s: overall score, KOMA snap, ECHO tone, Hall of Fame crystal chord (>= 9.0), verdict
 *
 * @param {Record<string, any>} work
 * @param {{ durationSec?: number }} [options]
 */
export function buildTimeline(work, options = {}) {
  const safeWork = work && typeof work === 'object' ? work : {};
  const model = buildCardModel(safeWork);
  const rawDuration = Number(options.durationSec);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : VIDEO_DURATION_SEC;
  const scale = duration / VIDEO_DURATION_SEC;

  const geralScore = clamp01(finiteOr(model.geralScore, 0) / 10) * 10;
  const isHallOfFame = geralScore >= HALL_OF_FAME_THRESHOLD;
  const palette = Array.isArray(model.palette) && model.palette.length === 2
    ? [model.palette[0], model.palette[1]]
    : [...DEFAULT_PALETTE];

  const barWindows = model.criteriaBars.map((bar, index) => {
    const start = (1.0 + index * 0.65) * scale;
    const end = (1.85 + index * 0.65) * scale;
    return {
      key: bar.key,
      label: bar.label,
      targetScore: clamp01(finiteOr(bar.score, 0) / 10) * 10,
      start,
      end
    };
  });

  /** @type {Array<{ t: number, voz: string, params: Record<string, any> }>} */
  const rawEvents = [];

  rawEvents.push({
    t: roundTime(0.08 * scale),
    voz: 'shutterClick',
    params: {}
  });

  for (const bar of barWindows) {
    const span = bar.end - bar.start;
    for (const frac of [0.35, 0.78]) {
      rawEvents.push({
        t: roundTime(bar.start + span * frac),
        voz: 'sliderTick',
        params: {
          barKey: bar.key,
          score: Math.round(bar.targetScore * frac * 10) / 10
        }
      });
    }
  }

  rawEvents.push({
    t: roundTime(5.05 * scale),
    voz: 'paperSnap',
    params: {}
  });

  const trilhaBar = barWindows.find((b) => b.key === 'trilha');
  const arteBar = barWindows.find((b) => b.key === 'direcao_arte');
  const echoToneScore = Math.round(
    (((trilhaBar?.targetScore ?? geralScore) + (arteBar?.targetScore ?? geralScore)) / 2) * 10
  ) / 10;

  rawEvents.push({
    t: roundTime(5.35 * scale),
    voz: 'echoTone',
    params: {
      score: echoToneScore
    }
  });

  if (isHallOfFame) {
    rawEvents.push({
      t: roundTime(5.75 * scale),
      voz: 'crystalChord',
      params: {
        geral: Math.round(geralScore * 10) / 10
      }
    });
  }

  const maxEventT = Math.max(0, duration - 0.001);
  const audioEvents = Object.freeze(
    rawEvents
      .map((evt) => ({
        t: Math.max(0, Math.min(maxEventT, evt.t)),
        voz: evt.voz,
        params: Object.freeze({ ...evt.params })
      }))
      .sort((a, b) => a.t - b.t)
      .map((evt) => Object.freeze(evt))
  );

  /**
   * Computes the pure deterministic visual + mascot-input state at time `t` seconds.
   * Safe for any finite or non-finite `t`, strictly bounded to [0, duration].
   * @param {number} t
   */
  function stateAt(t) {
    const safeT = Number.isFinite(t) ? Math.max(0, Math.min(duration, t)) : 0;

    const introProgress = easeOutCubic(windowProgress(safeT, 0, 0.7 * scale));
    const titleProgress = easeOutCubic(windowProgress(safeT, 0.1 * scale, 0.85 * scale));
    const specsProgress = easeOutCubic(windowProgress(safeT, 0.35 * scale, 1.0 * scale));

    const animatedScores = {};
    const barsProgress = barWindows.map((bar) => {
      const linear = windowProgress(safeT, bar.start, bar.end);
      const progress = easeOutCubic(linear);
      const currentScore = Math.min(bar.targetScore, bar.targetScore * progress);
      animatedScores[bar.key] = currentScore;
      return {
        key: bar.key,
        label: bar.label,
        targetScore: bar.targetScore,
        progress,
        currentScore,
        ratio: Math.max(0, Math.min(1, currentScore / 10)),
        active: linear > 0 && linear < 1
      };
    });

    const scoreProgress = easeOutCubic(windowProgress(safeT, 5.0 * scale, 5.75 * scale));
    const currentGeralScore = Math.min(geralScore, geralScore * scoreProgress);
    const verdictProgress = easeOutCubic(windowProgress(safeT, 5.2 * scale, 6.1 * scale));
    const badgeProgress = isHallOfFame
      ? easeOutCubic(windowProgress(safeT, 5.65 * scale, 6.2 * scale))
      : 0;
    const outroProgress = easeOutCubic(windowProgress(safeT, 6.25 * scale, duration));

    animatedScores.geral = safeT >= 5.0 * scale
      ? Math.min(geralScore, 5.5 + (geralScore - 5.5) * scoreProgress)
      : 5.5;

    const mascotInputs = {
      contextKind: 'video',
      title: model.titleText,
      scores: animatedScores,
      palette,
      savedPulse: isHallOfFame && safeT >= 5.65 * scale && safeT <= 6.85 * scale
    };

    return {
      t: safeT,
      duration,
      introProgress,
      titleProgress,
      specsProgress,
      barsProgress,
      scoreProgress,
      currentGeralScore,
      verdictProgress,
      badgeProgress,
      isHallOfFame,
      outroProgress,
      mascotInputs
    };
  }

  return {
    duration,
    isHallOfFame,
    geralScore,
    model,
    stateAt,
    audioEvents
  };
}

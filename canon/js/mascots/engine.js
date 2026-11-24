/**
 * Pure deterministic mascot world engine (fixed dt = 1/60, mulberry32 PRNG, semi-implicit Euler springs).
 * Zero DOM, zero Math.random(), zero Date.now(), zero performance.now(), zero literal colors.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { applyEchoInputs, createEchoState, drawEcho, stepEcho, triggerEchoImpulse } from './echo.js';
import { applyKinoInputs, createKinoState, drawKino, stepKino, triggerKinoImpulse } from './kino.js';
import { applyKomaInputs, createKomaState, drawKoma, stepKoma, triggerKomaImpulse } from './koma.js';
import { applySaveInputs, createSaveState, drawSave, stepSave, triggerSaveImpulse } from './save.js';

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export const MASCOT_IDS = Object.freeze(['koma', 'save', 'kino', 'echo']);

/**
 * Deterministic 32-bit seeded PRNG (Mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRng(seed = 1) {
  let state = (Number.isFinite(seed) ? seed : 1) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Semi-implicit Euler damped spring integrator with finite-value guard.
 * @param {{ x: number, v: number, target: number }} spring
 * @param {number} dt
 * @param {number} [stiffness]
 * @param {number} [damping]
 */
export function stepSpring(spring, dt, stiffness = 180, damping = 16) {
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }
  const safeDt = Math.min(dt, FIXED_DT * 2);
  const x = Number.isFinite(spring.x) ? spring.x : 0;
  const v = Number.isFinite(spring.v) ? spring.v : 0;
  const target = Number.isFinite(spring.target) ? spring.target : 0;

  const accel = -stiffness * (x - target) - damping * v;
  const nextV = v + accel * safeDt;
  const nextX = x + nextV * safeDt;

  spring.v = Number.isFinite(nextV) ? Math.max(-60, Math.min(60, nextV)) : 0;
  spring.x = Number.isFinite(nextX) ? Math.max(-20, Math.min(20, nextX)) : target;
}

function normalizeScoresInput(scores) {
  const s = scores && typeof scores === 'object' ? scores : {};
  const read = (k, fallback = 0) => {
    const val = Number(s[k]);
    return Number.isFinite(val) ? Math.max(0, Math.min(10, val)) : fallback;
  };
  return {
    geral: read('geral', 5.5),
    historia: read('historia', 5.5),
    gameplay_ritmo: read('gameplay_ritmo', 5.5),
    graficos_fotografia: read('graficos_fotografia', 5.5),
    trilha: read('trilha', 5.5),
    direcao_arte: read('direcao_arte', 5.5)
  };
}

function normalizePaletteInput(palette) {
  if (Array.isArray(palette) && palette.length === 2 && typeof palette[0] === 'string' && typeof palette[1] === 'string') {
    return [palette[0], palette[1]];
  }
  return [...DEFAULT_PALETTE];
}

/**
 * Creates a pure deterministic mascot world.
 * @param {{ seed?: number }} [options]
 */
export function createWorld(options = {}) {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : 1337;
  const rng = createSeededRng(seed);

  const world = {
    seed,
    time: 0,
    accumulator: 0,
    inputs: {
      contextKind: 'none',
      title: '',
      scores: normalizeScoresInput({}),
      palette: [...DEFAULT_PALETTE]
    },
    koma: createKomaState(rng),
    save: createSaveState(),
    kino: createKinoState(),
    echo: createEchoState()
  };

  applyKomaInputs(world.koma, world.inputs.scores);
  applySaveInputs(world.save, world.inputs.scores, false);
  applyKinoInputs(world.kino, world.inputs.scores);
  applyEchoInputs(world.echo, world.inputs.scores);

  return world;
}

/**
 * Applies new inputs (scores, palette, context metadata, optional savedPulse) to the world.
 * @param {ReturnType<typeof createWorld>} world
 * @param {Record<string, any>} inputs
 */
export function setInputs(world, inputs = {}) {
  const scores = normalizeScoresInput(inputs.scores ?? world.inputs.scores);
  const palette = normalizePaletteInput(inputs.palette ?? world.inputs.palette);
  const savedPulse = inputs.savedPulse === true;

  world.inputs = {
    contextKind: inputs.contextKind || world.inputs.contextKind || 'none',
    title: typeof inputs.title === 'string' ? inputs.title : world.inputs.title,
    scores,
    palette
  };

  applyKomaInputs(world.koma, scores);
  applySaveInputs(world.save, scores, savedPulse);
  applyKinoInputs(world.kino, scores);
  applyEchoInputs(world.echo, scores);

  return world;
}

/**
 * Triggers a deterministic spring impulse on a specific mascot ('koma'|'save'|'kino'|'echo').
 * @param {ReturnType<typeof createWorld>} world
 * @param {'koma' | 'save' | 'kino' | 'echo'} mascotId
 */
export function triggerMascotImpulse(world, mascotId) {
  if (mascotId === 'koma') {
    triggerKomaImpulse(world.koma);
  } else if (mascotId === 'save') {
    triggerSaveImpulse(world.save);
  } else if (mascotId === 'kino') {
    triggerKinoImpulse(world.kino);
  } else if (mascotId === 'echo') {
    triggerEchoImpulse(world.echo);
  }
}

/**
 * Advances the simulation deterministically using fixed dt = 1/60 steps and a step cap.
 * @param {ReturnType<typeof createWorld>} world
 * @param {number} dt
 */
export function advance(world, dt) {
  if (!Number.isFinite(dt) || dt <= 0) {
    return world;
  }

  const maxAccum = FIXED_DT * MAX_STEPS_PER_FRAME;
  world.accumulator = Math.min(world.accumulator + dt, maxAccum);

  let steps = 0;
  while (world.accumulator + 1e-9 >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    world.accumulator = Math.max(0, world.accumulator - FIXED_DT);
    world.time += FIXED_DT;

    stepKoma(world.koma, FIXED_DT, stepSpring);
    stepSave(world.save, FIXED_DT, stepSpring);
    stepKino(world.kino, FIXED_DT, stepSpring);
    stepEcho(world.echo, FIXED_DT, stepSpring);

    steps += 1;
  }

  return world;
}

/**
 * Returns a pure serializable snapshot of the mascot world for assertions and rendering.
 * @param {ReturnType<typeof createWorld>} world
 */
export function snapshot(world) {
  return structuredClone({
    seed: world.seed,
    time: Number(world.time.toFixed(6)),
    inputs: world.inputs,
    koma: world.koma,
    save: world.save,
    kino: world.kino,
    echo: world.echo
  });
}

/**
 * Computes 4 horizontal cell rects for KOMA, SAVE, KINO, and ECHO.
 * @param {{ width: number, height: number }} size
 */
export function computeMascotRects(size) {
  const width = Math.max(1, Number.isFinite(size?.width) ? size.width : 400);
  const height = Math.max(1, Number.isFinite(size?.height) ? size.height : 120);
  const cellW = width / 4;
  return {
    koma: { x: 0, y: 0, width: cellW, height },
    save: { x: cellW, y: 0, width: cellW, height },
    kino: { x: cellW * 2, y: 0, width: cellW, height },
    echo: { x: cellW * 3, y: 0, width: cellW, height }
  };
}

/**
 * Draws all 4 mascots onto a Canvas 2D context using resolved theme colors (no DOM reads, no literal colors).
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createWorld>} world
 * @param {{ width: number, height: number }} size
 * @param {{ ink: string, paper: string, surface: string, accent: string, glow: string, crack: string, workA?: string, workB?: string }} theme
 */
export function drawWorld(ctx, world, size, theme) {
  const width = Math.max(1, Number.isFinite(size?.width) ? size.width : 400);
  const height = Math.max(1, Number.isFinite(size?.height) ? size.height : 120);
  const rects = computeMascotRects({ width, height });

  const resolvedTheme = {
    ink: theme.ink,
    paper: theme.paper,
    surface: theme.surface,
    accent: theme.accent,
    glow: theme.glow,
    crack: theme.crack,
    workA: world.inputs.palette[0] || theme.workA || theme.accent,
    workB: world.inputs.palette[1] || theme.workB || theme.glow
  };

  ctx.clearRect(0, 0, width, height);
  drawKoma(ctx, world.koma, rects.koma, resolvedTheme, world.time);
  drawSave(ctx, world.save, rects.save, resolvedTheme);
  drawKino(ctx, world.kino, rects.kino, resolvedTheme);
  drawEcho(ctx, world.echo, rects.echo, resolvedTheme);
}

/**
 * Pure deterministic mascot world engine (fixed dt = 1/60, mulberry32 PRNG, semi-implicit Euler springs).
 * Zero DOM, zero Math.random(), zero Date.now(), zero performance.now(), zero literal colors.
 *
 * Eyes (gaze + blink) live in `state.eyes` of each mascot and depend ONLY on the accumulated simulation
 * time, the optional pointer and the mascot index, so 60 fps and 30 fps stay physically identical and the
 * shared seeded PRNG is never consumed by them.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { applyEchoInputs, createEchoState, drawEcho, stepEcho, triggerEchoImpulse } from './echo.js';
import { applyKinoInputs, createKinoState, drawKino, stepKino, triggerKinoImpulse } from './kino.js';
import { applyKomaInputs, createKomaState, drawKoma, stepKoma, triggerKomaImpulse } from './koma.js';
import { applySaveInputs, createSaveState, drawSave, stepSave, triggerSaveImpulse } from './save.js';

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export const MASCOT_IDS = Object.freeze(['koma', 'save', 'kino', 'echo']);

export const GAZE_RANGE = 1;
export const BLINK_MIN_INTERVAL = 2.4;
export const BLINK_MAX_INTERVAL = 6.0;
export const BLINK_DURATION = 0.16;

// Horizontal centers (normalized -1..1) of the 4 mascot cells, used to aim each gaze at the pointer.
const MASCOT_CENTERS_X = Object.freeze([-0.75, -0.25, 0.25, 0.75]);

// ECHO combo is History + Soundtrack both at 10. The ECHO module still counts 5 legacy keys, so the
// engine feeds it an adapter: gameplay/graphics are zeroed and the legacy slot is capped below 10.
const ECHO_LEGACY_SLOT_CAP = 9.99;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

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

function hashUint32(a, b) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Pure blink schedule: seconds until the next blink of a mascot, from its index and blink counter only.
 * Never touches the shared PRNG, so blinks are independent of the world seed and asynchronous per mascot.
 * @param {number} mascotIndex
 * @param {number} blinkCount
 * @returns {number}
 */
export function getBlinkInterval(mascotIndex, blinkCount) {
  const index = Number.isFinite(mascotIndex) ? Math.trunc(mascotIndex) : 0;
  const count = Number.isFinite(blinkCount) ? Math.max(0, Math.trunc(blinkCount)) : 0;
  const unit = hashUint32(index + 1, count + 1) / 4294967296;
  return BLINK_MIN_INTERVAL + unit * (BLINK_MAX_INTERVAL - BLINK_MIN_INTERVAL);
}

function createEyeState(mascotIndex) {
  return {
    gaze: {
      x: { x: 0, v: 0, target: 0 },
      y: { x: 0, v: 0, target: 0 }
    },
    blink: {
      count: 0,
      nextAt: getBlinkInterval(mascotIndex, 0),
      blinking: false,
      progress: 0,
      openness: 1
    }
  };
}

function stepEyes(eyes, mascotIndex, world) {
  const time = world.time;

  let targetX;
  let targetY;
  if (world.pointer.active) {
    targetX = clamp(world.pointer.x - MASCOT_CENTERS_X[mascotIndex], -1, 1) * GAZE_RANGE;
    targetY = clamp(world.pointer.y, -1, 1) * GAZE_RANGE;
  } else {
    // Gentle deterministic drift driven only by accumulated simulation time and mascot index.
    targetX = 0.35 * Math.sin(time * 0.6 + mascotIndex * 1.7) + 0.15 * Math.sin(time * 1.3 + mascotIndex * 2.9);
    targetY = 0.2 * Math.sin(time * 0.5 + mascotIndex * 2.3);
  }

  eyes.gaze.x.target = targetX;
  eyes.gaze.y.target = targetY;
  stepSpring(eyes.gaze.x, FIXED_DT, 120, 14);
  stepSpring(eyes.gaze.y, FIXED_DT, 120, 14);

  const blink = eyes.blink;
  if (!blink.blinking && time + 1e-9 >= blink.nextAt) {
    blink.blinking = true;
    blink.progress = 0;
  }
  if (blink.blinking) {
    blink.progress += FIXED_DT;
    const phase = Math.min(1, blink.progress / BLINK_DURATION);
    blink.openness = 1 - Math.sin(Math.PI * phase);
    if (phase >= 1) {
      blink.blinking = false;
      blink.progress = 0;
      blink.openness = 1;
      blink.count += 1;
      blink.nextAt = time + getBlinkInterval(mascotIndex, blink.count);
    }
  }
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
    trilha: read('trilha', 5.5)
  };
}

function buildEchoInputs(scores) {
  return {
    trilha: scores.trilha,
    historia: scores.historia,
    gameplay_ritmo: 0,
    graficos_fotografia: 0,
    direcao_arte: Math.min(scores.trilha, ECHO_LEGACY_SLOT_CAP)
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
    pointer: { active: false, x: 0, y: 0 },
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

  world.koma.eyes = createEyeState(0);
  world.save.eyes = createEyeState(1);
  world.kino.eyes = createEyeState(2);
  world.echo.eyes = createEyeState(3);

  applyKomaInputs(world.koma, world.inputs.scores);
  applySaveInputs(world.save, world.inputs.scores, false);
  applyKinoInputs(world.kino, world.inputs.scores);
  applyEchoInputs(world.echo, buildEchoInputs(world.inputs.scores));

  return world;
}

/**
 * Applies new inputs (scores, palette, context metadata, optional savedPulse) to the world.
 * Only the overall score and the 4 active criteria are read; legacy keys are ignored.
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
  applyEchoInputs(world.echo, buildEchoInputs(scores));

  return world;
}

/**
 * Sets the pointer in normalized coordinates (-1..1). Out-of-range values are clamped.
 * Invalid or non-finite values (or null/undefined) deactivate the pointer, so the gaze falls back to the
 * deterministic drift and every number in the world state stays finite.
 * @param {ReturnType<typeof createWorld>} world
 * @param {number | null} [x]
 * @param {number | null} [y]
 */
export function setPointer(world, x, y) {
  const valid = typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y);
  world.pointer = valid
    ? { active: true, x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
    : { active: false, x: 0, y: 0 };
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

    MASCOT_IDS.forEach((id, index) => {
      stepEyes(world[id].eyes, index, world);
    });

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
    pointer: world.pointer,
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
 * Resolves the per-mascot ink: `theme.<id>Ink` (e.g. komaInk) or the default accent color.
 * @param {Record<string, any>} theme
 * @param {'koma' | 'save' | 'kino' | 'echo'} mascotId
 * @returns {string}
 */
export function resolveMascotInk(theme, mascotId) {
  const custom = theme?.[`${mascotId}Ink`];
  return typeof custom === 'string' && custom ? custom : theme.accent;
}

/**
 * Draws all 4 mascots onto a Canvas 2D context using resolved theme colors (no DOM reads, no literal colors).
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createWorld>} world
 * @param {{ width: number, height: number }} size
 * @param {{ ink: string, paper: string, surface: string, accent: string, glow: string, crack: string, workA?: string, workB?: string, komaInk?: string, saveInk?: string, kinoInk?: string, echoInk?: string }} theme
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
  const themeFor = (id) => ({ ...resolvedTheme, mascotInk: resolveMascotInk(theme, id) });

  ctx.clearRect(0, 0, width, height);
  drawKoma(ctx, world.koma, rects.koma, themeFor('koma'), world.time);
  drawSave(ctx, world.save, rects.save, themeFor('save'));
  drawKino(ctx, world.kino, rects.kino, themeFor('kino'));
  drawEcho(ctx, world.echo, rects.echo, themeFor('echo'));
}

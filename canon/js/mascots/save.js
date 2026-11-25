/**
 * SAVE (organic crystal creature): reflects work palette colors; spins fast on save and in Hall of Fame (>= 9.0).
 * Drawn with plain path commands only (moveTo/lineTo/arc) so it also runs on a minimal mock.
 */

export const SAVE_HALL_OF_FAME_MIN = 9.0;
const BASE_SPIN_SPEED = 0.45;
const HALL_SPIN_SPEED = 4.2;
const SAVE_BOOST_DECAY = 3.2;
const TWO_PI = Math.PI * 2;

// Asymmetric facet outline: [angle offset in radians, radius factor] around the body.
const CRYSTAL_VERTICES = Object.freeze([
  [0.0, 1.0],
  [0.12, 0.8],
  [-0.08, 0.98],
  [0.1, 0.76],
  [0.0, 1.06],
  [-0.12, 0.84],
  [0.08, 0.95],
  [-0.1, 0.78],
  [0.05, 0.92]
]);

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

export function createSaveState() {
  return {
    angle: 0,
    spinBoost: 0,
    hallOfFame: false,
    scale: { x: 1, v: 0, target: 1 }
  };
}

export function applySaveInputs(state, scores, savedPulse = false) {
  const geral = clamp(scores?.geral ?? 0, 0, 10);
  state.hallOfFame = geral >= SAVE_HALL_OF_FAME_MIN;
  state.scale.target = state.hallOfFame ? 1.12 : 1.0;

  if (savedPulse) {
    state.spinBoost = 9.5;
    state.scale.v += 3.2;
  }
}

export function stepSave(state, dt, stepSpring) {
  const baseSpeed = state.hallOfFame ? HALL_SPIN_SPEED : BASE_SPIN_SPEED;
  const totalSpeed = baseSpeed + state.spinBoost;
  state.angle = (state.angle + totalSpeed * dt) % (Math.PI * 2);
  state.spinBoost = Math.max(0, state.spinBoost - state.spinBoost * Math.min(1, SAVE_BOOST_DECAY * dt));
  stepSpring(state.scale, dt, 190, 14);
}

export function triggerSaveImpulse(state) {
  state.spinBoost = Math.max(state.spinBoost, 7.0);
  state.scale.v += 3.0;
}

function traceEllipse(ctx, cx, cy, rx, ry, steps = 14) {
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * TWO_PI;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function drawEye(ctx, cx, cy, rx, ry, pupilR, gazeX, gazeY, openness, theme, lineW) {
  const open = clamp(openness, 0.06, 1);
  const eyeRy = ry * open;

  ctx.fillStyle = theme.paper;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  traceEllipse(ctx, cx, cy, rx, eyeRy);
  ctx.fill();
  ctx.stroke();

  const pupilRx = Math.min(pupilR, rx * 0.9);
  const pupilRy = Math.min(pupilR, eyeRy * 0.9);
  const px = cx + clamp(gazeX, -1, 1) * Math.max(0, rx - pupilRx) * 0.85;
  const py = cy + clamp(gazeY, -1, 1) * Math.max(0, eyeRy - pupilRy) * 0.8;

  ctx.fillStyle = theme.ink;
  ctx.beginPath();
  traceEllipse(ctx, px, py, pupilRx, pupilRy);
  ctx.fill();

  if (open > 0.5) {
    ctx.fillStyle = theme.paper;
    ctx.beginPath();
    ctx.arc(px - pupilRx * 0.3, py - pupilRy * 0.3, Math.max(0.5, pupilRx * 0.22), 0, TWO_PI);
    ctx.fill();
  }
}

export function drawSave(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const r = unit * 0.3;
  const s = clamp(state.scale.x, 0.72, 1.4);
  const angle = num(state.angle, 0);
  const ink = theme.mascotInk || theme.accent;
  const excited = state.hallOfFame || state.spinBoost > 1;

  const eyes = state.eyes;
  const gazeX = num(eyes?.gaze?.x?.x, 0);
  const gazeY = num(eyes?.gaze?.y?.x, 0);
  const blinkOpen = clamp(num(eyes?.blink?.openness, 1), 0, 1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  if (state.hallOfFame || state.spinBoost > 1) {
    ctx.strokeStyle = theme.workB;
    ctx.lineWidth = Math.max(1.5, unit * 0.022);
    ctx.globalAlpha = state.hallOfFame ? 0.55 : 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, TWO_PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Spinning crystal body: asymmetric facets in two solid colors (workA / workB).
  ctx.save();
  ctx.rotate(angle);
  const count = CRYSTAL_VERTICES.length;
  const hub = [r * 0.06, -r * 0.05];
  const ring = CRYSTAL_VERTICES.map(([offset, radius], i) => {
    const a = (i / count) * TWO_PI + offset;
    return [Math.cos(a) * r * radius, Math.sin(a) * r * radius];
  });
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1.5, unit * 0.024);
  for (let i = 0; i < count; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % count];
    ctx.fillStyle = i % 2 === 0 ? theme.workA : theme.workB;
    ctx.beginPath();
    ctx.moveTo(hub[0], hub[1]);
    ctx.lineTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Hall of Fame sparkles orbit with the spin angle (deterministic, no extra state).
  if (state.hallOfFame) {
    ctx.fillStyle = ink;
    for (let i = 0; i < 3; i += 1) {
      const a = angle * 0.5 + (i / 3) * TWO_PI;
      const sx = Math.cos(a) * r * 1.35;
      const sy = Math.sin(a) * r * 1.35;
      const sz = unit * 0.035;
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx + sz, sy);
      ctx.lineTo(sx, sy + sz);
      ctx.lineTo(sx - sz, sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Face stays upright while the crystal spins.
  const eyeRx = r * (excited ? 0.24 : 0.21);
  const eyeRy = r * (excited ? 0.28 : 0.24);
  const pupilR = eyeRx * (excited ? 0.62 : 0.52);
  const lineW = Math.max(1, unit * 0.014);
  drawEye(ctx, -r * 0.3, -r * 0.08, eyeRx, eyeRy, pupilR, gazeX, gazeY, blinkOpen, theme, lineW);
  drawEye(ctx, r * 0.3, -r * 0.08, eyeRx, eyeRy, pupilR, gazeX, gazeY, blinkOpen, theme, lineW);

  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1.5, unit * 0.02);
  if (excited) {
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(0, r * 0.3, r * 0.16, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.14, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  ctx.restore();
}

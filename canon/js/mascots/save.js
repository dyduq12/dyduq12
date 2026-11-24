/**
 * SAVE (polygonal crystal): reflects work palette colors; spins fast on save and in Hall of Fame (>= 9.0).
 */

export const SAVE_HALL_OF_FAME_MIN = 9.0;
const BASE_SPIN_SPEED = 0.45;
const HALL_SPIN_SPEED = 4.2;
const SAVE_BOOST_DECAY = 3.2;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
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

export function drawSave(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const r = unit * 0.28;
  const s = clamp(state.scale.x, 0.72, 1.4);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  if (state.hallOfFame || state.spinBoost > 1) {
    ctx.strokeStyle = theme.workB;
    ctx.lineWidth = Math.max(1.5, unit * 0.022);
    ctx.globalAlpha = state.hallOfFame ? 0.55 : 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.rotate(state.angle);

  // Outer faceted gem (6-sided polygon)
  const sides = 6;
  ctx.fillStyle = theme.workA;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(2, unit * 0.028);
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const radius = i % 2 === 0 ? r : r * 0.84;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner luminous facet with second palette color
  ctx.fillStyle = theme.workB;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * (r * 0.45);
    const py = Math.sin(a) * (r * 0.45);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

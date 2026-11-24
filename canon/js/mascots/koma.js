/**
 * KOMA (manga panel frame): reacts to overall score (geral) and story score (historia).
 * Thresholds: >= 9.0 shonen impact lines; 6.0..8.9 proportional tilt; 5.0..5.9 neutral; < 5.0 cracks.
 */

export const KOMA_IMPACT_MIN = 9.0;
export const KOMA_TILT_MIN = 6.0;
export const KOMA_TILT_MAX = 8.9;
export const KOMA_CRACK_MAX_EXCLUSIVE = 5.0;

const MAX_TILT_RAD = 0.22;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

export function createKomaState(rng) {
  const impactRays = [];
  for (let i = 0; i < 12; i += 1) {
    const baseAngle = (i / 12) * Math.PI * 2;
    const jitter = (rng() - 0.5) * 0.2;
    impactRays.push({
      angle: baseAngle + jitter,
      lengthFactor: 0.65 + rng() * 0.35
    });
  }

  return {
    mode: 'neutral',
    impactIntensity: 0,
    crackLevel: 0,
    tilt: { x: 0, v: 0, target: 0 },
    bounce: { x: 1, v: 0, target: 1 },
    impactRays
  };
}

export function applyKomaInputs(state, scores) {
  const geral = clamp(scores?.geral ?? 0, 0, 10);
  const historia = clamp(scores?.historia ?? 0, 0, 10);

  if (geral >= KOMA_IMPACT_MIN) {
    state.mode = 'impact';
    state.impactIntensity = 0.6 + 0.4 * clamp((geral - KOMA_IMPACT_MIN) / (10 - KOMA_IMPACT_MIN), 0, 1);
    state.crackLevel = 0;
    state.tilt.target = 0;
  } else if (geral >= KOMA_TILT_MIN) {
    state.mode = 'tilt';
    state.impactIntensity = 0;
    state.crackLevel = 0;
    const ratio = clamp((geral - KOMA_TILT_MIN) / (KOMA_TILT_MAX - KOMA_TILT_MIN), 0, 1);
    state.tilt.target = (0.25 + 0.75 * ratio) * MAX_TILT_RAD;
  } else if (geral < KOMA_CRACK_MAX_EXCLUSIVE) {
    state.mode = 'crack';
    state.impactIntensity = 0;
    state.crackLevel = 0.35 + 0.65 * clamp((KOMA_CRACK_MAX_EXCLUSIVE - geral) / KOMA_CRACK_MAX_EXCLUSIVE, 0, 1);
    state.tilt.target = -0.06 * state.crackLevel;
  } else {
    // 5.0 .. 5.9: neutral range (ADR-0011)
    state.mode = 'neutral';
    state.impactIntensity = 0;
    state.crackLevel = 0;
    state.tilt.target = 0;
  }

  state.bounce.target = 0.94 + 0.14 * (historia / 10);
}

export function stepKoma(state, dt, stepSpring) {
  stepSpring(state.tilt, dt, 160, 16);
  stepSpring(state.bounce, dt, 210, 17);
}

export function triggerKomaImpulse(state) {
  state.bounce.v += 2.6;
  state.tilt.v += state.mode === 'crack' ? -1.4 : 1.4;
}

export function drawKoma(ctx, state, rect, theme, time) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const boxW = unit * 0.56;
  const boxH = unit * 0.68;

  ctx.save();
  ctx.translate(cx, cy);

  if (state.impactIntensity > 0) {
    const pulse = 1 + 0.08 * Math.sin(time * 12);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = Math.max(1.5, unit * 0.024);
    ctx.globalAlpha = 0.8 * state.impactIntensity;
    for (const ray of state.impactRays) {
      const rInner = unit * 0.34;
      const rOuter = unit * (0.48 + 0.12 * ray.lengthFactor * pulse);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ray.angle) * rInner, Math.sin(ray.angle) * rInner);
      ctx.lineTo(Math.cos(ray.angle) * rOuter, Math.sin(ray.angle) * rOuter);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const scaleVal = clamp(state.bounce.x, 0.72, 1.35);
  ctx.rotate(clamp(state.tilt.x, -0.6, 0.6));
  ctx.scale(scaleVal, 2 - scaleVal * 0.96);

  ctx.fillStyle = theme.paper;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(2, unit * 0.032);
  ctx.beginPath();
  ctx.rect(-boxW * 0.5, -boxH * 0.5, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  // Inner manga panel rule
  ctx.strokeStyle = state.mode === 'impact' ? theme.accent : theme.ink;
  ctx.lineWidth = Math.max(1, unit * 0.016);
  ctx.globalAlpha = 0.65;
  ctx.strokeRect(-boxW * 0.36, -boxH * 0.34, boxW * 0.72, boxH * 0.44);
  ctx.globalAlpha = 1;

  if (state.crackLevel > 0) {
    ctx.strokeStyle = theme.crack;
    ctx.lineWidth = Math.max(1.5, unit * 0.026);
    ctx.globalAlpha = clamp(state.crackLevel, 0.3, 1);
    ctx.beginPath();
    ctx.moveTo(-boxW * 0.28, -boxH * 0.32);
    ctx.lineTo(-boxW * 0.05, -boxH * 0.08);
    ctx.lineTo(-boxW * 0.16, boxH * 0.12);
    ctx.lineTo(boxW * 0.14, boxH * 0.34);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

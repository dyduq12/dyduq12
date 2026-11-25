/**
 * KOMA (torn manga panel creature): reacts to overall score (geral) and story score (historia).
 * Thresholds: >= 9.0 shonen impact lines; 6.0..8.9 proportional tilt; 5.0..5.9 neutral; < 5.0 cracks.
 * Drawn with plain path commands only (moveTo/lineTo/arc, evenodd fill) so it also runs on a minimal mock.
 */

export const KOMA_IMPACT_MIN = 9.0;
export const KOMA_TILT_MIN = 6.0;
export const KOMA_TILT_MAX = 8.9;
export const KOMA_CRACK_MAX_EXCLUSIVE = 5.0;

const MAX_TILT_RAD = 0.22;
const TWO_PI = Math.PI * 2;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
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

function tracePolygon(ctx, points) {
  if (points.length === 0) {
    return;
  }
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
}

function traceEllipse(ctx, cx, cy, rx, ry, steps = 16) {
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

// Deterministic zig-zag points between a and b (excluding both ends) to fake a torn paper edge.
function tornEdge(a, b, steps, amp, seed) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = dy / len;
  const ny = -dx / len;
  const pts = [];
  for (let k = 1; k < steps; k += 1) {
    const t = k / steps;
    const pattern = (((k * 5 + seed * 3) % 7) - 3) / 3;
    const jag = (k % 2 === 0 ? 1 : -1) * amp * (0.55 + 0.45 * Math.abs(pattern));
    pts.push([a[0] + dx * t + nx * jag, a[1] + dy * t + ny * jag]);
  }
  return pts;
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

export function drawKoma(ctx, state, rect, theme, time) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const hw = unit * 0.31;
  const hh = unit * 0.37;
  const ink = theme.mascotInk || theme.accent;

  const mode = state.mode;
  const excited = mode === 'impact';
  const cracked = state.crackLevel > 0;
  const eyes = state.eyes;
  const gazeX = num(eyes?.gaze?.x?.x, 0);
  const gazeY = num(eyes?.gaze?.y?.x, 0);
  const blinkOpen = clamp(num(eyes?.blink?.openness, 1), 0, 1);

  ctx.save();
  ctx.translate(cx, cy);

  if (state.impactIntensity > 0) {
    const pulse = 1 + 0.08 * Math.sin(num(time, 0) * 12);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.5, unit * 0.024);
    ctx.globalAlpha = clamp(0.8 * state.impactIntensity, 0, 1);
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

  // Solid asymmetric panel silhouette with torn right and bottom edges.
  const tl = [-hw, -hh * 0.96];
  const tr = [hw * 0.9, -hh];
  const br = [hw, hh * 0.9];
  const bl = [-hw * 0.94, hh];
  const outer = [
    tl,
    tr,
    ...tornEdge(tr, br, 7, hw * 0.08, 1),
    br,
    ...tornEdge(br, bl, 6, hh * 0.06, 4),
    bl,
    [-hw * 0.98, hh * 0.05]
  ];
  // Negative-space cut-outs (evenodd): the panel window and two gutter notches in the solid frame.
  const windowCut = [
    [-hw * 0.66, -hh * 0.62],
    [hw * 0.62, -hh * 0.66],
    [hw * 0.68, hh * 0.5],
    [-hw * 0.62, hh * 0.54]
  ];
  const notchTop = [
    [-hw * 0.1, -hh * 0.9],
    [hw * 0.18, -hh * 0.9],
    [hw * 0.08, -hh * 0.74],
    [-hw * 0.2, -hh * 0.74]
  ];
  const notchBottom = [
    [-hw * 0.5, hh * 0.68],
    [-hw * 0.2, hh * 0.68],
    [-hw * 0.3, hh * 0.84],
    [-hw * 0.6, hh * 0.84]
  ];

  ctx.fillStyle = ink;
  ctx.beginPath();
  tracePolygon(ctx, outer);
  tracePolygon(ctx, windowCut);
  tracePolygon(ctx, notchTop);
  tracePolygon(ctx, notchBottom);
  ctx.fill('evenodd');

  // Eyes inside the panel window.
  const eyeRx = hw * 0.25 * (excited ? 1.12 : 1);
  const eyeRy = hh * 0.24 * (excited ? 1.12 : 1);
  const pupilR = eyeRx * (excited ? 0.62 : cracked ? 0.4 : 0.5);
  const openness = blinkOpen * (cracked ? 0.78 : 1);
  const eyeY = -hh * 0.06;
  const lineW = Math.max(1, unit * 0.014);
  drawEye(ctx, -hw * 0.33, eyeY, eyeRx, eyeRy, pupilR, gazeX, gazeY, openness, theme, lineW);
  drawEye(ctx, hw * 0.33, eyeY, eyeRx, eyeRy, pupilR, gazeX, gazeY, openness, theme, lineW);

  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1.5, unit * 0.02);
  if (cracked) {
    // Worried brows and a small frown.
    const browY = eyeY - eyeRy * 1.3;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.33 - eyeRx, browY + hh * 0.06);
    ctx.lineTo(-hw * 0.33 + eyeRx * 0.7, browY - hh * 0.04);
    ctx.moveTo(hw * 0.33 + eyeRx, browY + hh * 0.06);
    ctx.lineTo(hw * 0.33 - eyeRx * 0.7, browY - hh * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, hh * 0.44, hw * 0.14, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (excited) {
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(0, hh * 0.24, hw * 0.16, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  } else if (mode === 'tilt') {
    ctx.beginPath();
    ctx.arc(0, hh * 0.22, hw * 0.14, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.12, hh * 0.34);
    ctx.lineTo(hw * 0.12, hh * 0.34);
    ctx.stroke();
  }

  if (cracked) {
    ctx.strokeStyle = theme.crack;
    ctx.lineWidth = Math.max(1.5, unit * 0.026);
    ctx.globalAlpha = clamp(state.crackLevel, 0.3, 1);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.3, -hh * 0.98);
    ctx.lineTo(-hw * 0.05, -hh * 0.5);
    ctx.lineTo(-hw * 0.18, -hh * 0.12);
    ctx.lineTo(hw * 0.12, hh * 0.3);
    ctx.lineTo(hw * 0.02, hh * 0.98);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

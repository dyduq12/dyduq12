/**
 * ECHO (wavy sphere creature with harmonic rings): reacts to trilha (Soundtrack) and historia (Story);
 * triggers the visual combo when both reach 10 simultaneously.
 * Drawn with plain path commands only (moveTo/lineTo/arc, evenodd fill) so it also runs on a minimal mock.
 */

export const ECHO_COMBO_SCORE = 10;
export const ECHO_COMBO_MIN_COUNT = 2;

const COMBO_KEYS = ['trilha', 'historia'];
const TWO_PI = Math.PI * 2;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Maps a score (0..10) to an octave offset [0..3] for ECHO audio synthesis.
 * @param {number} score
 * @returns {number}
 */
export function scoreToEchoOctave(score) {
  const s = clamp(score, 0, 10);
  if (s >= 9.0) {
    return 3;
  }
  if (s >= 6.5) {
    return 2;
  }
  if (s >= 3.5) {
    return 1;
  }
  return 0;
}

export function createEchoState() {
  return {
    phase: 0,
    ringSpeed: 1.2,
    comboActive: false,
    maxCriteriaCount: 0,
    amplitude: { x: 0.35, v: 0, target: 0.35 },
    pulse: { x: 1, v: 0, target: 1 }
  };
}

export function applyEchoInputs(state, scores) {
  const trilha = clamp(scores?.trilha ?? 0, 0, 10);
  const avg = trilha / 10;

  let maxCount = 0;
  for (const key of COMBO_KEYS) {
    if (clamp(scores?.[key] ?? 0, 0, 10) >= ECHO_COMBO_SCORE) {
      maxCount += 1;
    }
  }

  state.maxCriteriaCount = maxCount;
  state.comboActive = maxCount >= ECHO_COMBO_MIN_COUNT;
  state.ringSpeed = 1.0 + avg * 3.2 + (state.comboActive ? 1.5 : 0);
  state.amplitude.target = 0.25 + avg * 0.75;
  state.pulse.target = state.comboActive ? 1.12 : 1.0;
}

export function stepEcho(state, dt, stepSpring) {
  state.phase = (state.phase + state.ringSpeed * dt) % (Math.PI * 2);
  stepSpring(state.amplitude, dt, 150, 14);
  stepSpring(state.pulse, dt, 180, 15);
}

export function triggerEchoImpulse(state) {
  state.amplitude.v += 2.2;
  state.pulse.v += 2.6;
}

function traceWavy(ctx, radius, wobble, lobes, phase, steps) {
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * TWO_PI;
    const r = radius * (1 + wobble * Math.sin(lobes * a + phase) + wobble * 0.45 * Math.sin((lobes * 2 + 1) * a - phase * 1.3));
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
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

export function drawEcho(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const coreR = unit * 0.16 * clamp(state.pulse.x, 0.75, 1.35);
  const amp = clamp(state.amplitude.x, 0.1, 1.3);
  const phase = num(state.phase, 0);
  const combo = state.comboActive;
  const ink = theme.mascotInk || theme.accent;

  const eyes = state.eyes;
  const gazeX = num(eyes?.gaze?.x?.x, 0);
  const gazeY = num(eyes?.gaze?.y?.x, 0);
  const blinkOpen = clamp(num(eyes?.blink?.openness, 1), 0, 1);

  ctx.save();
  ctx.translate(cx, cy);

  // Harmonic resonance rings around the creature.
  const ringCount = combo ? 3 : 2;
  for (let i = 0; i < ringCount; i += 1) {
    const wave = 0.5 + 0.5 * Math.sin(phase + i * 1.4);
    const ringR = coreR * (1.5 + i * 0.42 + wave * 0.25 * amp);
    ctx.strokeStyle = combo && i === ringCount - 1 ? theme.glow : ink;
    ctx.lineWidth = Math.max(1.5, unit * (combo ? 0.026 : 0.02));
    ctx.globalAlpha = clamp(0.85 - i * 0.22, 0.2, 0.9);
    ctx.beginPath();
    traceWavy(ctx, ringR, 0.025 + 0.02 * amp, 5 + i, phase * (1 + i * 0.4), 48);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Solid body with an undulating outline; the mouth is a negative-space cut-out (evenodd).
  const mouthRx = coreR * 0.2 * (0.8 + 0.4 * amp);
  const mouthRy = coreR * 0.09 * (0.6 + 0.8 * amp) * (combo ? 1.3 : 1);
  ctx.fillStyle = ink;
  ctx.beginPath();
  traceWavy(ctx, coreR, 0.05 + 0.06 * amp, 6, phase * 1.5, 40);
  traceEllipse(ctx, 0, coreR * 0.46, mouthRx, mouthRy, 12);
  ctx.fill('evenodd');

  if (combo) {
    ctx.strokeStyle = theme.glow;
    ctx.lineWidth = Math.max(1.5, unit * 0.022);
    ctx.beginPath();
    traceWavy(ctx, coreR, 0.05 + 0.06 * amp, 6, phase * 1.5, 40);
    ctx.stroke();
  }

  // Eyes on the sphere.
  const eyeRx = coreR * 0.26 * (combo ? 1.12 : 1);
  const eyeRy = coreR * 0.3 * (combo ? 1.12 : 1);
  const pupilR = eyeRx * (combo ? 0.64 : 0.5);
  const lineW = Math.max(1, unit * 0.012);
  drawEye(ctx, -coreR * 0.36, -coreR * 0.1, eyeRx, eyeRy, pupilR, gazeX, gazeY, blinkOpen, theme, lineW);
  drawEye(ctx, coreR * 0.36, -coreR * 0.1, eyeRx, eyeRy, pupilR, gazeX, gazeY, blinkOpen, theme, lineW);

  ctx.restore();
}

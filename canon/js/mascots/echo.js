/**
 * ECHO (sphere with harmonic rings): reacts to trilha and direcao_arte;
 * triggers visual combo when 2+ of the 5 criteria reach 10 simultaneously.
 */

export const ECHO_COMBO_SCORE = 10;
export const ECHO_COMBO_MIN_COUNT = 2;

const FIVE_CRITERIA_KEYS = [
  'historia',
  'gameplay_ritmo',
  'graficos_fotografia',
  'trilha',
  'direcao_arte'
];

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
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
  const direcaoArte = clamp(scores?.direcao_arte ?? 0, 0, 10);
  const avg = (trilha + direcaoArte) / 20;

  let maxCount = 0;
  for (const key of FIVE_CRITERIA_KEYS) {
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

export function drawEcho(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const coreR = unit * 0.16 * clamp(state.pulse.x, 0.75, 1.35);
  const amp = clamp(state.amplitude.x, 0.1, 1.3);

  ctx.save();
  ctx.translate(cx, cy);

  const ringCount = state.comboActive ? 3 : 2;
  for (let i = 0; i < ringCount; i += 1) {
    const wave = 0.5 + 0.5 * Math.sin(state.phase + i * 1.4);
    const ringR = coreR * (1.55 + i * 0.65 + wave * 0.35 * amp);
    ctx.strokeStyle = state.comboActive && i === ringCount - 1 ? theme.glow : theme.accent;
    ctx.lineWidth = Math.max(1.5, unit * (state.comboActive ? 0.026 : 0.02));
    ctx.globalAlpha = clamp(0.85 - i * 0.22, 0.2, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Core sphere
  ctx.fillStyle = state.comboActive ? theme.glow : theme.ink;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1.5, unit * 0.024);
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

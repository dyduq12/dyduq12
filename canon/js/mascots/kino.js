/**
 * KINO (35mm viewfinder/lens): spring-driven aperture driven by gameplay_ritmo and graficos_fotografia;
 * blinks shutter whenever either score changes.
 */

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

export function createKinoState() {
  return {
    lastGameplay: null,
    lastGraphics: null,
    shutterFlash: 0,
    aperture: { x: 0.55, v: 0, target: 0.55 },
    recoil: { x: 1, v: 0, target: 1 }
  };
}

export function applyKinoInputs(state, scores) {
  const gameplay = clamp(scores?.gameplay_ritmo ?? 0, 0, 10);
  const graphics = clamp(scores?.graficos_fotografia ?? 0, 0, 10);

  const changed =
    (state.lastGameplay !== null && state.lastGameplay !== gameplay) ||
    (state.lastGraphics !== null && state.lastGraphics !== graphics);

  state.lastGameplay = gameplay;
  state.lastGraphics = graphics;

  const avg = (gameplay + graphics) / 20;
  state.aperture.target = 0.25 + 0.68 * avg;

  if (changed) {
    state.shutterFlash = 1.0;
    state.aperture.v -= 5.2;
    state.recoil.v -= 2.4;
  }
}

export function stepKino(state, dt, stepSpring) {
  stepSpring(state.aperture, dt, 220, 16);
  stepSpring(state.recoil, dt, 200, 16);
  state.shutterFlash = Math.max(0, state.shutterFlash - dt * 4.5);
}

export function triggerKinoImpulse(state) {
  state.shutterFlash = 1.0;
  state.aperture.v -= 6.0;
  state.recoil.v -= 2.8;
}

export function drawKino(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const bodyW = unit * 0.66;
  const bodyH = unit * 0.48;
  const scale = clamp(state.recoil.x, 0.78, 1.25);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Camera viewfinder housing
  ctx.fillStyle = theme.surface;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(2, unit * 0.03);
  ctx.beginPath();
  ctx.rect(-bodyW * 0.5, -bodyH * 0.5, bodyW, bodyH);
  ctx.fill();
  ctx.stroke();

  // Outer lens barrel
  const outerR = unit * 0.2;
  ctx.fillStyle = theme.paper;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner spring-driven aperture opening
  const openRatio = clamp(state.aperture.x, 0.12, 0.95);
  const innerR = outerR * openRatio;
  ctx.fillStyle = theme.ink;
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fill();

  // Shutter blink overlay
  if (state.shutterFlash > 0.02) {
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = clamp(state.shutterFlash, 0, 1) * 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, outerR * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

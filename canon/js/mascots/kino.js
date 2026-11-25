/**
 * KINO (organic cinema camera/projector creature): spring-driven aperture driven by gameplay_ritmo and
 * graficos_fotografia; blinks shutter whenever either score changes.
 * Drawn with plain path commands only (moveTo/lineTo/arc, evenodd fill) so it also runs on a minimal mock.
 */

const TWO_PI = Math.PI * 2;

function clamp(v, min, max) {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
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

function rectPoints(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ];
}

function drawFilm(ctx, cx, cy, r, hole) {
  ctx.beginPath();
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.moveTo(cx + hole, cy);
  ctx.arc(cx, cy, hole, 0, TWO_PI);
  ctx.fill('evenodd');
}

// Eye with shutter-blade eyelids: the slit narrows on blink and the blades are drawn as ink bars.
function drawShutterEye(ctx, cx, cy, rx, ry, pupilR, gazeX, gazeY, openness, theme, lineW) {
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

  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = lineW * 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.95, cy - eyeRy);
  ctx.lineTo(cx + rx * 0.95, cy - eyeRy);
  ctx.moveTo(cx - rx * 0.95, cy + eyeRy);
  ctx.lineTo(cx + rx * 0.95, cy + eyeRy);
  ctx.stroke();
}

export function drawKino(ctx, state, rect, theme) {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const unit = Math.max(8, Math.min(rect.width, rect.height));
  const hw = unit * 0.34;
  const hh = unit * 0.3;
  const scale = clamp(state.recoil.x, 0.78, 1.25);
  const ink = theme.mascotInk || theme.accent;

  const flash = clamp(num(state.shutterFlash, 0), 0, 1);
  const aperture = clamp(num(state.aperture.x, 0.55), 0.12, 0.95);
  const eyes = state.eyes;
  const gazeX = num(eyes?.gaze?.x?.x, 0);
  const gazeY = num(eyes?.gaze?.y?.x, 0);
  const blinkOpen = clamp(num(eyes?.blink?.openness, 1), 0, 1);

  ctx.save();
  ctx.translate(cx, cy + hh * 0.1);
  ctx.scale(scale, scale);

  // Film reels (two sizes) on top of the body, solid with a negative-space hub.
  ctx.fillStyle = ink;
  drawFilm(ctx, -hw * 0.5, -hh * 1.05, hh * 0.3, hh * 0.12);
  drawFilm(ctx, hw * 0.05, -hh * 1.02, hh * 0.24, hh * 0.1);

  // Asymmetric chamfered body with a lens barrel on the right.
  const body = [
    [-hw * 0.95, -hh * 0.55],
    [-hw * 0.7, -hh * 0.78],
    [hw * 0.35, -hh * 0.8],
    [hw * 0.55, -hh * 0.62],
    [hw * 0.62, -hh * 0.45],
    [hw * 1.0, -hh * 0.38],
    [hw * 1.1, -hh * 0.2],
    [hw * 1.1, hh * 0.28],
    [hw * 1.0, hh * 0.42],
    [hw * 0.62, hh * 0.5],
    [hw * 0.5, hh * 0.82],
    [-hw * 0.8, hh * 0.84],
    [-hw * 0.98, hh * 0.6]
  ];
  // Negative space: eye window, lens opening and a row of film perforations.
  const eyeWindow = [
    [-hw * 0.62, -hh * 0.3],
    [hw * 0.5, -hh * 0.34],
    [hw * 0.56, hh * 0.3],
    [-hw * 0.58, hh * 0.34]
  ];
  const lensX = hw * 0.88;
  const lensY = hh * 0.04;
  const lensR = hh * 0.17;

  ctx.fillStyle = ink;
  ctx.beginPath();
  tracePolygon(ctx, body);
  tracePolygon(ctx, eyeWindow);
  traceEllipse(ctx, lensX, lensY, lensR, lensR, 14);
  for (let i = 0; i < 4; i += 1) {
    tracePolygon(ctx, rectPoints(-hw * 0.7 + i * hw * 0.3, hh * 0.52, hw * 0.16, hh * 0.14));
  }
  ctx.fill('evenodd');

  // Lens aperture follows the spring-driven opening.
  ctx.fillStyle = ink;
  ctx.beginPath();
  traceEllipse(ctx, lensX, lensY, lensR * aperture, lensR * aperture, 12);
  ctx.fill();

  // Flash bulb lights up when the shutter fires.
  if (flash > 0.02) {
    ctx.fillStyle = theme.glow;
    ctx.globalAlpha = flash * 0.85;
    ctx.beginPath();
    ctx.arc(hw * 0.78, -hh * 0.66, hh * 0.16, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Eyes in the window: wide for a bright aperture, squinting while the shutter flashes.
  const eyeRx = hw * 0.2;
  const eyeRy = hh * 0.22;
  const pupilR = eyeRx * (0.35 + 0.4 * aperture);
  const openness = blinkOpen * (1 - 0.55 * flash);
  const lineW = Math.max(1, unit * 0.014);
  drawShutterEye(ctx, -hw * 0.28, 0, eyeRx, eyeRy, pupilR, gazeX, gazeY, openness, theme, lineW);
  drawShutterEye(ctx, hw * 0.28, 0, eyeRx, eyeRy, pupilR, gazeX, gazeY, openness, theme, lineW);

  ctx.restore();
}

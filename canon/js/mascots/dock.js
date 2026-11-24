/**
 * Mascot dock DOM bridge: single Canvas 2D inside [data-mascot-dock], ResizeObserver (dpr <= 2),
 * single rAF loop paused on hidden tab / offscreen / prefers-reduced-motion,
 * Pointer Events (R3), sound toggle, and audio/haptics wiring.
 * Zero Math.random, zero Date.now, zero performance.now, zero literal colors.
 */

import { DEFAULT_PALETTE } from '../core/schema.js';
import { createTickThrottler, playVoice } from '../audio/synth.js';
import { createAudioController } from '../audio/unlock.js';
import {
  FIXED_DT,
  advance,
  computeMascotRects,
  createWorld,
  drawWorld,
  setInputs,
  triggerMascotImpulse
} from './engine.js';
import { triggerHaptic } from './haptics.js';

const TAP_TOLERANCE_PX = 10;
const MASCOT_LABELS = [
  ['koma', 'KOMA'],
  ['save', 'SAVE'],
  ['kino', 'KINO'],
  ['echo', 'ECHO']
];

function readResolvedTheme() {
  const styles = getComputedStyle(document.documentElement);
  const pick = (name) => styles.getPropertyValue(name).trim();
  return {
    ink: pick('--mascot-ink'),
    paper: pick('--mascot-paper'),
    surface: pick('--mascot-surface'),
    accent: pick('--mascot-accent'),
    glow: pick('--mascot-glow'),
    crack: pick('--mascot-crack'),
    workA: pick('--work-a'),
    workB: pick('--work-b')
  };
}

function hitTestMascot(localX, localY, width, height) {
  const rects = computeMascotRects({ width, height });
  for (const [id] of MASCOT_LABELS) {
    const r = rects[id];
    if (localX >= r.x && localX <= r.x + r.width && localY >= r.y && localY <= r.y + r.height) {
      return id;
    }
  }
  return null;
}

/**
 * Mounts the mascot dock inside `[data-mascot-dock]`.
 * @param {HTMLElement} container
 * @param {{ bus: ReturnType<typeof import('../core/events.js').createEventBus>, toast?: ReturnType<typeof import('../ui/toast.js').createToaster> }} deps
 */
export function mountMascotDock(container, deps) {
  if (!container) {
    return null;
  }

  container.replaceChildren();
  container.className = 'canon-mascot-dock';
  container.removeAttribute('aria-hidden');

  const topBar = document.createElement('div');
  topBar.className = 'canon-mascot-dock-bar';

  const contextLabel = document.createElement('p');
  contextLabel.className = 'canon-mascot-dock-context';
  contextLabel.textContent = 'Mascotes: aguardando contexto';

  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'canon-sound-btn';
  soundBtn.setAttribute('aria-pressed', 'false');
  soundBtn.textContent = 'Som: Silenciado';

  topBar.append(contextLabel, soundBtn);

  const canvas = document.createElement('canvas');
  canvas.className = 'canon-mascot-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const labelsList = document.createElement('ul');
  labelsList.className = 'canon-mascot-labels';
  for (const [, name] of MASCOT_LABELS) {
    const li = document.createElement('li');
    li.textContent = name;
    labelsList.appendChild(li);
  }

  container.append(topBar, canvas, labelsList);

  const ctx = canvas.getContext('2d');
  const world = createWorld({ seed: 2026 });
  let theme = readResolvedTheme();
  let logicalWidth = 400;
  let logicalHeight = 120;

  let formContext = null;
  let cardContext = null;

  let isVisible = true;
  let isHiddenTab = Boolean(document.hidden);
  const reducedMotionQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = Boolean(reducedMotionQuery?.matches);

  let rafId = null;
  let lastFrameTime = null;
  let simulatedTimeMs = 0;

  const tickThrottler = createTickThrottler({
    intervalMs: 80,
    now: () => simulatedTimeMs
  });

  const audio = createAudioController({
    onStateChange: (status) => {
      if (!status.supported) {
        soundBtn.disabled = true;
        soundBtn.setAttribute('aria-pressed', 'false');
        soundBtn.textContent = 'Som: Indisponível';
        if (status.error) {
          deps.toast?.warning(status.error);
        }
        return;
      }
      soundBtn.setAttribute('aria-pressed', String(status.enabled));
      soundBtn.textContent = status.enabled ? 'Som: Ativo' : 'Som: Silenciado';
    }
  });

  function renderFrame() {
    if (!ctx) {
      return;
    }
    drawWorld(ctx, world, { width: logicalWidth, height: logicalHeight }, theme);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    logicalWidth = Math.max(240, Math.round(rect.width || 400));
    logicalHeight = Math.max(96, Math.round(rect.height || 120));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    renderFrame();
  }

  function syncLoopState() {
    const shouldAnimate = !isHiddenTab && isVisible && !reducedMotion;
    if (!shouldAnimate && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastFrameTime = null;
    } else if (shouldAnimate && rafId === null) {
      lastFrameTime = null;
      rafId = requestAnimationFrame(onAnimationFrame);
    }
  }

  function onAnimationFrame(frameTime) {
    rafId = null;
    if (isHiddenTab || !isVisible || reducedMotion) {
      lastFrameTime = null;
      return;
    }
    const dt = lastFrameTime === null ? FIXED_DT : Math.max(0, (frameTime - lastFrameTime) / 1000);
    lastFrameTime = frameTime;
    simulatedTimeMs = world.time * 1000;

    advance(world, dt);
    renderFrame();
    rafId = requestAnimationFrame(onAnimationFrame);
  }

  // Precedence rule: active form > flipped card > none
  function applyActiveContext(extra = {}) {
    const active = formContext || cardContext;
    if (active) {
      setInputs(world, {
        contextKind: formContext ? 'form' : 'card',
        title: active.title || '',
        scores: active.scores || {},
        palette: active.palette || DEFAULT_PALETTE,
        savedPulse: extra.savedPulse === true
      });
      const sourceTag = formContext ? 'formulário' : 'card';
      contextLabel.textContent = `Mascotes (${sourceTag}): ${active.title || 'Nova obra'}`;
    } else {
      setInputs(world, {
        contextKind: 'none',
        title: '',
        scores: {},
        palette: DEFAULT_PALETTE,
        savedPulse: extra.savedPulse === true
      });
      contextLabel.textContent = 'Mascotes: aguardando contexto';
    }
    renderFrame();
  }

  function playSafeSound(voiceName, params = {}, useTickThrottle = false) {
    if (!audio.isEnabled()) {
      return;
    }
    const audioCtx = audio.getContext();
    if (!audioCtx || audioCtx.state !== 'running') {
      return;
    }
    simulatedTimeMs = world.time * 1000;
    if (useTickThrottle) {
      if (!tickThrottler.canTriggerTick(simulatedTimeMs)) {
        return;
      }
    } else if (!tickThrottler.reserveVoiceSlot(260, simulatedTimeMs)) {
      return;
    }
    playVoice(voiceName, audioCtx, audioCtx.currentTime, params);
  }

  soundBtn.addEventListener('click', () => {
    const status = audio.toggleFromGesture();
    if (status.enabled) {
      triggerHaptic('tap', { enabled: true, reducedMotion });
      playSafeSound('save');
    }
  });

  // Pointer Events (R3) on canvas with pan-y scroll preservation
  let activePointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pressedMascot = null;

  const onCanvasPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    audio.ensureResumedInGesture();
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const hit = hitTestMascot(localX, localY, rect.width, rect.height);
    if (!hit) {
      return;
    }
    activePointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pressedMascot = hit;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (err) {
      console.warn('[dock] Captura de ponteiro indisponível no canvas:', { message: err?.message });
    }
  };

  const onCanvasPointerUp = (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    const dist = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
    const mascot = pressedMascot;
    activePointerId = null;
    pressedMascot = null;
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch (err) {
      console.warn('[dock] Falha ao liberar captura no pointerup:', { message: err?.message });
    }

    if (dist <= TAP_TOLERANCE_PX && mascot) {
      triggerMascotImpulse(world, mascot);
      renderFrame();
      triggerHaptic('tap', { enabled: audio.isEnabled(), reducedMotion });
      const scoreForEcho = world.inputs.scores.trilha;
      playSafeSound(mascot, { score: scoreForEcho });
    }
  };

  function cancelCanvasPointer(event) {
    if (activePointerId !== event.pointerId) {
      return;
    }
    activePointerId = null;
    pressedMascot = null;
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch (err) {
      console.warn('[dock] Falha ao liberar captura ao cancelar gesto:', { message: err?.message });
    }
  }

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointercancel', cancelCanvasPointer);
  canvas.addEventListener('lostpointercapture', cancelCanvasPointer);

  // Bus event listeners
  const unsubSlider = deps.bus.on('slider:change', (payload) => {
    audio.ensureResumedInGesture();
    if (payload && typeof payload.name === 'string') {
      if (!formContext) {
        formContext = { title: 'Formulário', scores: { ...world.inputs.scores }, palette: [...world.inputs.palette] };
      }
      formContext.scores = {
        ...formContext.scores,
        [payload.name]: payload.value
      };
      applyActiveContext();
      if (payload.name === 'gameplay_ritmo' || payload.name === 'graficos_fotografia') {
        playSafeSound('kino', {}, true);
      } else {
        playSafeSound('tick', { score: payload.value }, true);
      }
    }
  });

  const unsubFormCtx = deps.bus.on('form:context', (payload) => {
    if (!payload || payload.active === false) {
      formContext = null;
    } else {
      formContext = {
        title: payload.title || 'Formulário',
        scores: { ...(payload.scores || {}) },
        palette: Array.isArray(payload.palette) ? [...payload.palette] : [...DEFAULT_PALETTE]
      };
    }
    applyActiveContext();
  });

  const unsubCardFlip = deps.bus.on('card:flip', (payload) => {
    if (payload?.flipped && payload.work) {
      cardContext = payload.work;
    } else if (!payload?.flipped && cardContext?.id === payload?.work?.id) {
      cardContext = null;
    }
    applyActiveContext();
  });

  const unsubWorkSaved = deps.bus.on('work:saved', (payload) => {
    if (payload?.work) {
      formContext = null;
      cardContext = payload.work;
      applyActiveContext({ savedPulse: true });
      triggerHaptic(world.echo.comboActive ? 'combo' : 'save', {
        enabled: audio.isEnabled(),
        reducedMotion
      });
      playSafeSound('save');
    }
  });

  const unsubTheme = deps.bus.on('theme:change', () => {
    theme = readResolvedTheme();
    renderFrame();
  });

  const onVisibility = () => {
    isHiddenTab = Boolean(document.hidden);
    syncLoopState();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onReducedMotionChange = (ev) => {
    reducedMotion = Boolean(ev.matches);
    syncLoopState();
    renderFrame();
  };
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas);
  }

  let intersectionObserver = null;
  if (typeof IntersectionObserver === 'function') {
    intersectionObserver = new IntersectionObserver((entries) => {
      isVisible = entries.some((entry) => entry.isIntersecting);
      syncLoopState();
    });
    intersectionObserver.observe(container);
  }

  resizeCanvas();
  applyActiveContext();
  syncLoopState();

  return {
    destroy() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      unsubSlider();
      unsubFormCtx();
      unsubCardFlip();
      unsubWorkSaved();
      unsubTheme();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
      canvas.removeEventListener('pointercancel', cancelCanvasPointer);
      canvas.removeEventListener('lostpointercapture', cancelCanvasPointer);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      audio.destroy();
    }
  };
}

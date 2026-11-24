/**
 * Web Audio unlock and lifecycle controller.
 * Creates/resumes AudioContext synchronously inside user gestures and handles suspended/interrupted states.
 */

function defaultCreateContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof Ctor !== 'function') {
    return null;
  }
  return new Ctor();
}

/**
 * Creates an audio unlock & mute controller starting muted by default.
 * @param {{
 *   createContext?: () => BaseAudioContext | null,
 *   documentObj?: Document,
 *   onStateChange?: (status: { enabled: boolean, supported: boolean, state: string, error: string | null }) => void
 * }} [options]
 */
export function createAudioController(options = {}) {
  const createContext = options.createContext || defaultCreateContext;
  const documentObj = options.documentObj ?? globalThis.document;
  const hasNativeCtor =
    typeof options.createContext === 'function' ||
    typeof globalThis.AudioContext === 'function' ||
    typeof globalThis.webkitAudioContext === 'function';

  let ctx = null;
  let enabled = false;
  let supported = hasNativeCtor;
  let lastError = null;

  function notify() {
    options.onStateChange?.({
      enabled,
      supported,
      state: ctx?.state || (supported ? 'uninitialized' : 'unsupported'),
      error: lastError
    });
  }

  function resumeSyncIfNeeded() {
    if (!ctx || typeof ctx.resume !== 'function') {
      return;
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch((err) => {
            lastError = err?.message || 'Não foi possível retomar o áudio.';
            notify();
          });
        }
      } catch (err) {
        lastError = err?.message || 'Não foi possível retomar o áudio.';
      }
    }
  }

  /**
   * Must be called synchronously inside a user gesture handler (click/pointerup/keydown).
   * Never throws to callers.
   */
  function toggleFromGesture() {
    if (!supported) {
      enabled = false;
      lastError = 'Web Audio indisponível neste navegador.';
      notify();
      return getStatus();
    }

    if (enabled) {
      enabled = false;
      lastError = null;
      notify();
      return getStatus();
    }

    try {
      if (!ctx) {
        ctx = createContext();
      }
      if (!ctx) {
        supported = false;
        enabled = false;
        lastError = 'Web Audio indisponível neste navegador.';
        notify();
        return getStatus();
      }

      // Synchronous resume inside user gesture before any await
      resumeSyncIfNeeded();
      enabled = true;
      lastError = null;
      notify();
      return getStatus();
    } catch (err) {
      supported = false;
      enabled = false;
      lastError = err?.message || 'Falha ao iniciar áudio no navegador.';
      notify();
      return getStatus();
    }
  }

  /**
   * Synchronously attempts resume during subsequent user gestures if iOS interrupted or suspended the context.
   */
  function ensureResumedInGesture() {
    if (!enabled || !ctx) {
      return;
    }
    resumeSyncIfNeeded();
  }

  function handleVisibilityChange() {
    if (!documentObj || documentObj.hidden) {
      return;
    }
    if (enabled && ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) {
      resumeSyncIfNeeded();
    }
  }

  if (documentObj && typeof documentObj.addEventListener === 'function') {
    documentObj.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function getStatus() {
    return {
      enabled,
      supported,
      state: ctx?.state || (supported ? 'uninitialized' : 'unsupported'),
      error: lastError
    };
  }

  function destroy() {
    if (documentObj && typeof documentObj.removeEventListener === 'function') {
      documentObj.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  return {
    toggleFromGesture,
    ensureResumedInGesture,
    handleVisibilityChange,
    getContext: () => ctx,
    isEnabled: () => enabled,
    isSupported: () => supported,
    getStatus,
    destroy
  };
}

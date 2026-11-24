/**
 * Optional vibration feedback (navigator.vibrate) guarded by sound toggle, user gesture, and reduced-motion.
 */

const HAPTIC_PATTERNS = Object.freeze({
  tap: 12,
  save: [14, 28, 18],
  combo: [14, 24, 14, 24, 28]
});

/**
 * Triggers a short haptic pattern when supported and permitted. Never throws.
 * @param {'tap' | 'save' | 'combo' | number | number[]} patternOrKind
 * @param {{
 *   enabled?: boolean,
 *   reducedMotion?: boolean,
 *   navigatorObj?: Navigator
 * }} [options]
 * @returns {boolean}
 */
export function triggerHaptic(patternOrKind, options = {}) {
  if (!options.enabled || options.reducedMotion) {
    return false;
  }

  const nav = options.navigatorObj ?? globalThis.navigator;
  if (!nav || typeof nav.vibrate !== 'function') {
    return false;
  }

  const pattern =
    typeof patternOrKind === 'string'
      ? HAPTIC_PATTERNS[patternOrKind] ?? HAPTIC_PATTERNS.tap
      : patternOrKind;

  try {
    return Boolean(nav.vibrate(pattern));
  } catch {
    return false;
  }
}

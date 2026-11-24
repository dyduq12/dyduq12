/**
 * Custom accessible score slider (0..10, step 0.5) using Pointer Events (R3) and keyboard controls.
 */

function snapToStep(rawValue, min, max, step) {
  const clamped = Math.max(min, Math.min(max, rawValue));
  const snapped = Math.round(clamped / step) * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(1));
}

function formatScoreDisplay(value) {
  return value.toFixed(1).replace('.', ',');
}

/**
 * Creates a pointer-safe and keyboard-accessible score slider component.
 * @param {{
 *   id: string,
 *   name: string,
 *   label: string,
 *   value?: number,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   bus?: { emit: (event: string, payload?: unknown) => void },
 *   onChange?: (value: number) => void
 * }} config
 */
export function createScoreSlider(config) {
  const min = config.min ?? 0;
  const max = config.max ?? 10;
  const step = config.step ?? 0.5;

  let currentValue = snapToStep(config.value ?? 0, min, max, step);
  let previousValue = currentValue;
  let activePointerId = null;

  const row = document.createElement('div');
  row.className = 'canon-slider-row';

  const header = document.createElement('div');
  header.className = 'canon-slider-header';

  const labelEl = document.createElement('span');
  labelEl.id = `${config.id}-label`;
  labelEl.textContent = config.label;

  const readoutEl = document.createElement('span');
  readoutEl.className = 'canon-slider-value';
  readoutEl.textContent = formatScoreDisplay(currentValue);

  header.append(labelEl, readoutEl);

  const track = document.createElement('div');
  track.id = config.id;
  track.className = 'canon-slider-track';
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-labelledby', labelEl.id);
  track.setAttribute('aria-valuemin', String(min));
  track.setAttribute('aria-valuemax', String(max));

  const rail = document.createElement('div');
  rail.className = 'canon-slider-rail';

  const fill = document.createElement('div');
  fill.className = 'canon-slider-fill';

  const thumb = document.createElement('div');
  thumb.className = 'canon-slider-thumb';

  rail.appendChild(fill);
  track.append(rail, thumb);
  row.append(header, track);

  function renderVisual(val) {
    const span = max - min;
    const percent = span > 0 ? ((val - min) / span) * 100 : 0;
    fill.style.width = `${percent}%`;
    thumb.style.left = `${percent}%`;
    readoutEl.textContent = formatScoreDisplay(val);
    track.setAttribute('aria-valuenow', String(val));
    track.setAttribute('aria-valuetext', `${formatScoreDisplay(val)} de ${max}`);
  }

  function valueFromClientX(clientX) {
    const rect = track.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) {
      return currentValue;
    }
    const ratio = (clientX - rect.left) / rect.width;
    return snapToStep(min + ratio * (max - min), min, max, step);
  }

  function commitValue(nextValue) {
    currentValue = snapToStep(nextValue, min, max, step);
    renderVisual(currentValue);
    config.onChange?.(currentValue);
    config.bus?.emit('slider:change', { name: config.name, value: currentValue });
  }

  function cancelGesture(event) {
    if (activePointerId !== event.pointerId) {
      return;
    }
    activePointerId = null;
    try {
      if (track.hasPointerCapture?.(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    } catch (err) {
      console.warn('[sliders] Falha ao liberar captura de ponteiro ao cancelar:', { message: err?.message });
    }
    currentValue = previousValue;
    renderVisual(currentValue);
  }

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    event.preventDefault();
    previousValue = currentValue;
    activePointerId = event.pointerId;
    try {
      track.setPointerCapture(event.pointerId);
    } catch (err) {
      console.warn('[sliders] Captura de ponteiro indisponível:', { message: err?.message });
    }
    track.focus({ preventScroll: true });
    currentValue = valueFromClientX(event.clientX);
    renderVisual(currentValue);
  };

  const onPointerMove = (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    currentValue = valueFromClientX(event.clientX);
    renderVisual(currentValue);
  };

  const onPointerUp = (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    const committed = valueFromClientX(event.clientX);
    activePointerId = null;
    try {
      if (track.hasPointerCapture?.(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    } catch (err) {
      console.warn('[sliders] Falha ao liberar captura no pointerup:', { message: err?.message });
    }
    commitValue(committed);
  };

  const onKeyDown = (event) => {
    let delta = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      delta = step;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      delta = -step;
    } else if (event.key === 'PageUp') {
      delta = step * 2;
    } else if (event.key === 'PageDown') {
      delta = -(step * 2);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitValue(min);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      commitValue(max);
      return;
    }

    if (delta !== null) {
      event.preventDefault();
      commitValue(currentValue + delta);
    }
  };

  track.addEventListener('pointerdown', onPointerDown);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);
  track.addEventListener('pointercancel', cancelGesture);
  track.addEventListener('lostpointercapture', cancelGesture);
  track.addEventListener('keydown', onKeyDown);

  renderVisual(currentValue);

  return {
    element: row,
    getValue: () => currentValue,
    setValue: (nextVal) => {
      currentValue = snapToStep(nextVal, min, max, step);
      previousValue = currentValue;
      renderVisual(currentValue);
    },
    setLabel: (nextLabel) => {
      labelEl.textContent = nextLabel;
    },
    destroy: () => {
      activePointerId = null;
      track.removeEventListener('pointerdown', onPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', cancelGesture);
      track.removeEventListener('lostpointercapture', cancelGesture);
      track.removeEventListener('keydown', onKeyDown);
    }
  };
}

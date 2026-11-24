/**
 * Accessible aria-live toast notification manager using safe DOM APIs.
 */

const DEFAULT_DURATION_MS = 4500;

/**
 * Creates a toast presenter inside a container element.
 * @param {HTMLElement} container
 */
export function createToaster(container) {
  let counter = 0;

  function dismiss(toastEl) {
    if (toastEl && toastEl.parentNode) {
      toastEl.remove();
    }
  }

  /**
   * Displays a toast notification.
   * @param {string} message
   * @param {{ type?: 'info' | 'success' | 'warning' | 'error', durationMs?: number }} [options]
   */
  function show(message, options = {}) {
    if (!container || !message) {
      return;
    }

    const type = options.type || 'info';
    const durationMs = options.durationMs ?? (type === 'error' ? 7000 : DEFAULT_DURATION_MS);

    counter += 1;
    const toastEl = document.createElement('div');
    toastEl.className = 'canon-toast';
    toastEl.dataset.type = type;
    toastEl.dataset.toastId = String(counter);
    toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const textEl = document.createElement('span');
    textEl.textContent = String(message);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fechar';
    closeBtn.setAttribute('aria-label', 'Fechar notificação');

    let timerId = null;
    const close = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      dismiss(toastEl);
    };

    closeBtn.addEventListener('click', close);
    toastEl.append(textEl, closeBtn);
    container.appendChild(toastEl);

    if (durationMs > 0) {
      timerId = setTimeout(close, durationMs);
    }

    return close;
  }

  return {
    show,
    info: (msg, opts) => show(msg, { ...opts, type: 'info' }),
    success: (msg, opts) => show(msg, { ...opts, type: 'success' }),
    warning: (msg, opts) => show(msg, { ...opts, type: 'warning' }),
    error: (msg, opts) => show(msg, { ...opts, type: 'error' })
  };
}

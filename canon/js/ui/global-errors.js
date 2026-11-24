/**
 * Unhandled browser error and promise rejection listener bridging into the central error toast catalog.
 * Zero new globals, zero silent failures.
 */

import { formatUserError } from './errors.js';

/**
 * Installs window-level `'error'` and `'unhandledrejection'` listeners with cleanup handle.
 *
 * @param {{
 *   windowObj?: Window,
 *   toast?: { error?: (m: string) => void, warning?: (m: string) => void },
 *   consoleObj?: Pick<Console, 'error'>
 * }} [options]
 */
export function installGlobalErrorHandlers(options = {}) {
  const windowObj = options.windowObj ?? globalThis.window;
  const toast = options.toast;
  const consoleObj = options.consoleObj ?? globalThis.console;

  if (!windowObj || typeof windowObj.addEventListener !== 'function') {
    return { uninstall() {} };
  }

  const onError = (event) => {
    const err = event?.error || new Error(event?.message || 'Erro de execução.');
    const formatted = formatUserError(err, { context: 'Erro inesperado' });
    if (formatted.isCancellation) {
      return;
    }
    consoleObj?.error?.('[CANON][global-error]', {
      code: formatted.code,
      name: err?.name,
      message: err?.message
    });
    toast?.error?.('Ocorreu um erro inesperado na interface. Recomendamos exportar seu canon.json por segurança.');
  };

  const onUnhandledRejection = (event) => {
    const reason = event?.reason;
    const formatted = formatUserError(reason, { context: 'Operação assíncrona' });
    if (formatted.isCancellation) {
      return;
    }
    consoleObj?.error?.('[CANON][unhandledrejection]', {
      code: formatted.code,
      name: reason?.name,
      message: reason?.message
    });
    toast?.error?.(
      formatted.message || 'Ocorreu uma falha inesperada em segundo plano. Exporte seu canon.json se necessário.'
    );
  };

  windowObj.addEventListener('error', onError);
  windowObj.addEventListener('unhandledrejection', onUnhandledRejection);

  return {
    uninstall() {
      windowObj.removeEventListener?.('error', onError);
      windowObj.removeEventListener?.('unhandledrejection', onUnhandledRejection);
    }
  };
}

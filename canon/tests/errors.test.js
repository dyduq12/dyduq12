import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../js/api/http.js';
import { PosterExportError } from '../js/export/poster.js';
import { ShareError } from '../js/export/share.js';
import { VideoExportError } from '../js/export/video.js';
import { formatUserError, presentErrorToast } from '../js/ui/errors.js';
import { installGlobalErrorHandlers } from '../js/ui/global-errors.js';

describe('errors.js & global-errors.js — catálogo central e captura global', () => {
  it('mapeia todos os erros tipados para mensagens acionáveis em português sem vazar segredos/URLs', () => {
    const cases = [
      new HttpError('missing_key', 'raw secret hint'),
      new HttpError('auth', 'bad token', { status: 401 }),
      new HttpError('rate_limit', 'too many', { status: 429 }),
      new HttpError('bloqueio-de-rede', 'cors', { url: 'https://api.rawg.io/secret?key=123' }),
      new HttpError('network', 'offline', { url: 'https://secret.example/api?key=abc' }),
      new HttpError('timeout', 'timeout'),
      { code: 'CORS_OR_NETWORK', message: 'cover blocked' },
      new PosterExportError('TAINTED_CANVAS', 'tainted'),
      new PosterExportError('CANVAS_UNAVAILABLE', 'no ctx'),
      new VideoExportError('VID_UNSUPPORTED', 'no h264'),
      new VideoExportError('ENCODER_ERROR', 'failed'),
      new ShareError('SHARE_NOT_ALLOWED', 'denied'),
      new ShareError('SHARE_UNSUPPORTED', 'unsupported'),
      { name: 'QuotaExceededError', message: 'quota' }
    ];

    for (const err of cases) {
      const out = formatUserError(err, { provider: err.kind === 'rate_limit' ? 'anilist' : 'rawg' });
      assert.equal(out.isCancellation, false);
      assert.ok(out.message && out.message.length > 15, `Mensagem vazia ou curta para ${out.code}`);
      assert.equal(out.message.includes('?key='), false, 'Não pode vazar chave ou URL interna');
    }

    const memMsg = formatUserError(null, { isMemoryFallback: true });
    assert.match(memMsg.message, /perdidos ao fechar/i);
    assert.match(memMsg.message, /canon\.json/i);

    const rateMsg = formatUserError(new HttpError('rate_limit', '', { status: 429 }));
    assert.match(rateMsg.message, /30 req\/min/i);
  });

  it('nunca gera mensagem de falha para cancelamentos voluntários', () => {
    const emitted = [];
    const fakeToast = {
      error: (m) => emitted.push(['error', m]),
      warning: (m) => emitted.push(['warning', m])
    };

    const cancels = [
      new VideoExportError('EXPORT_CANCELLED', 'cancelled'),
      new ShareError('SHARE_CANCELLED', 'cancelled'),
      new HttpError('aborted', 'aborted'),
      Object.assign(new Error('Aborted'), { name: 'AbortError' })
    ];

    for (const c of cancels) {
      const res = presentErrorToast(fakeToast, c);
      assert.equal(res.isCancellation, true);
      assert.equal(res.message, null);
    }
    assert.equal(emitted.length, 0);
  });

  it('global-errors.js captura error e unhandledrejection, ignora abortos e desinstala listeners', () => {
    const listeners = new Map();
    const logs = [];
    const toasts = [];

    const fakeWin = {
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type, fn) {
        if (listeners.get(type) === fn) {
          listeners.delete(type);
        }
      }
    };

    const handle = installGlobalErrorHandlers({
      windowObj: fakeWin,
      toast: { error: (m) => toasts.push(m), warning: (m) => toasts.push(m) },
      consoleObj: { error: (...args) => logs.push(args) }
    });

    assert.equal(listeners.has('error'), true);
    assert.equal(listeners.has('unhandledrejection'), true);

    listeners.get('unhandledrejection')({ reason: new VideoExportError('EXPORT_CANCELLED', 'abort') });
    assert.equal(toasts.length, 0);
    assert.equal(logs.length, 0);

    listeners.get('error')({ error: new Error('Boom') });
    listeners.get('unhandledrejection')({ reason: new Error('Async boom') });
    assert.equal(logs.length, 2);
    assert.equal(toasts.length, 2);

    handle.uninstall();
    assert.equal(listeners.size, 0);
  });
});

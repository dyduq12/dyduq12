import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShareError,
  buildFile,
  buildPosterFilename,
  canShareFile,
  downloadFile,
  shareFile,
  slugifyTitle
} from '../js/export/share.js';

describe('share.js — nomes seguros, Web Share síncrono e fallback de download', () => {
  it('gera slug seguro a partir de acentos, símbolos, string vazia e títulos muito longos', () => {
    assert.equal(slugifyTitle('Café & Ação: Épico!'), 'cafe-acao-epico');
    assert.equal(buildPosterFilename({ title: 'Hollow Knight: Silksong' }), 'canon-hollow-knight-silksong.png');
    assert.equal(slugifyTitle('***!!!???'), 'obra');
    assert.equal(slugifyTitle(''), 'obra');
    assert.equal(buildPosterFilename({}), 'canon-obra.png');

    const veryLong = 'titulo-extremamente-longo-'.repeat(6);
    const bounded = slugifyTitle(veryLong);
    assert.ok(bounded.length <= 48);
    assert.equal(bounded.endsWith('-'), false);
    assert.match(bounded, /^[a-z0-9-]+$/);
  });

  it('constrói File PNG e avalia canShareFile com segurança inclusive em exceções', () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const file = buildFile(blob, { title: 'Duna: Parte Dois' });
    assert.ok(file instanceof File);
    assert.equal(file.name, 'canon-duna-parte-dois.png');
    assert.equal(file.type, 'image/png');

    assert.equal(canShareFile(file, { canShare: ({ files }) => files?.length === 1 }), true);
    assert.equal(canShareFile(file, { canShare: () => false }), false);
    assert.equal(canShareFile(file, {}), false);
    assert.equal(
      canShareFile(file, {
        canShare: () => {
          throw new TypeError('Unsupported');
        }
      }),
      false
    );
  });

  it('chama navigator.share SINCRONAMENTE antes de qualquer await (preserva ativação transitória)', async () => {
    const file = buildFile(new Blob(['png'], { type: 'image/png' }), { title: 'Akira' });
    const timeline = [];
    let resolveShare;

    const fakeNavigator = {
      canShare: () => true,
      share: (payload) => {
        timeline.push(`share_called:${payload.files[0].name}`);
        return new Promise((resolve) => {
          resolveShare = resolve;
        });
      }
    };

    const pendingPromise = shareFile(file, {
      title: 'Akira — CANON',
      text: 'Pôster editorial',
      navigatorObj: fakeNavigator
    });

    // Synchronous assertion right after handler invocation (zero microtask ticks awaited yet)
    assert.deepEqual(timeline, ['share_called:canon-akira.png']);

    resolveShare();
    const res = await pendingPromise;
    assert.equal(res.ok, true);
    assert.equal(res.cancelled, false);
    assert.equal(res.fellBackToDownload, false);
  });

  it('trata AbortError como cancelamento sem erro e cai para download em NotAllowedError', async () => {
    const file = buildFile(new Blob(['png'], { type: 'image/png' }), { title: 'Frieren' });

    let fallbackCount = 0;
    const abortRes = await shareFile(file, {
      navigatorObj: {
        canShare: () => true,
        share: async () => {
          const err = new Error('User cancelled');
          err.name = 'AbortError';
          throw err;
        }
      },
      fallbackDownload: () => {
        fallbackCount += 1;
      }
    });
    assert.equal(abortRes.ok, false);
    assert.equal(abortRes.cancelled, true);
    assert.equal(abortRes.error, null);
    assert.equal(fallbackCount, 0);

    const notAllowedRes = await shareFile(file, {
      navigatorObj: {
        canShare: () => true,
        share: async () => {
          const err = new Error('Activation expired');
          err.name = 'NotAllowedError';
          throw err;
        }
      },
      fallbackDownload: () => {
        fallbackCount += 1;
      }
    });
    assert.equal(notAllowedRes.ok, false);
    assert.equal(notAllowedRes.cancelled, false);
    assert.equal(notAllowedRes.fellBackToDownload, true);
    assert.equal(fallbackCount, 1);
    assert.ok(notAllowedRes.error instanceof ShareError);
    assert.equal(notAllowedRes.error.code, 'SHARE_NOT_ALLOWED');
  });

  it('downloadFile aciona <a download> e revoga a ObjectURL após o atraso', () => {
    const file = buildFile(new Blob(['png'], { type: 'image/png' }), { title: 'Chrono Trigger' });
    const createdUrls = [];
    const revokedUrls = [];
    let clicked = false;
    let removed = false;
    let capturedLink = null;
    let scheduledTimerFn = null;

    const fakeDoc = {
      body: {
        appendChild(el) {
          capturedLink = el;
        }
      },
      createElement(tag) {
        assert.equal(tag, 'a');
        return {
          href: '',
          download: '',
          rel: '',
          click() {
            clicked = true;
          },
          remove() {
            removed = true;
          }
        };
      }
    };

    const result = downloadFile(file, {
      doc: fakeDoc,
      urlApi: {
        createObjectURL: (blob) => {
          assert.equal(blob, file);
          const u = 'blob:http://localhost/poster-1';
          createdUrls.push(u);
          return u;
        },
        revokeObjectURL: (u) => {
          revokedUrls.push(u);
        }
      },
      setTimeoutFn: (fn) => {
        scheduledTimerFn = fn;
        return 1;
      }
    });

    assert.equal(result.ok, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(capturedLink.download, 'canon-chrono-trigger.png');
    assert.equal(revokedUrls.length, 0);

    scheduledTimerFn();
    assert.deepEqual(revokedUrls, createdUrls);
  });
});

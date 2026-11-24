import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PosterExportError, isSafeLocalCoverPath, renderPoster } from '../js/export/poster.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createFakeTheme() {
  return {
    id: 'paper',
    bg: '#F1EBDA',
    surface: '#FAF6EB',
    surfaceAlt: '#E5DEC9',
    text: '#16202C',
    textMuted: '#465364',
    border: '#C4BBA3',
    borderStrong: '#8F856D',
    accent: '#B33927',
    accentContrast: '#FAF6EB',
    grainAlpha: 0.045,
    fonts: {
      condensed: '"Bahnschrift", sans-serif',
      body: 'system-ui, sans-serif',
      mono: 'monospace'
    },
    mascot: {
      ink: '#16202C',
      paper: '#FAF6EB',
      surface: '#E5DEC9',
      accent: '#B33927',
      glow: '#D47420',
      crack: '#A12020'
    }
  };
}

function createFakeCanvasHarness(options = {}) {
  const calls = [];
  const textsDrawn = [];
  const fontsUsed = [];

  const checkFiniteArgs = (method, args) => {
    for (const arg of args) {
      if (typeof arg === 'number') {
        assert.ok(Number.isFinite(arg), `Argumento não-finito em ctx.${method}: ${arg}`);
      }
    }
  };

  let currentFont = '16px sans-serif';
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'top',
    lineCap: 'butt',
    lineJoin: 'miter',
    get font() {
      return currentFont;
    },
    set font(v) {
      currentFont = String(v);
      fontsUsed.push(currentFont);
      assert.equal(currentFont.includes('var('), false, `CSS var() proibido em ctx.font: ${currentFont}`);
    },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate(...a) { checkFiniteArgs('translate', a); calls.push('translate'); },
    rotate(...a) { checkFiniteArgs('rotate', a); calls.push('rotate'); },
    scale(...a) { checkFiniteArgs('scale', a); calls.push('scale'); },
    clearRect(...a) { checkFiniteArgs('clearRect', a); calls.push('clearRect'); },
    fillRect(...a) { checkFiniteArgs('fillRect', a); calls.push('fillRect'); },
    strokeRect(...a) { checkFiniteArgs('strokeRect', a); calls.push('strokeRect'); },
    beginPath() { calls.push('beginPath'); },
    closePath() { calls.push('closePath'); },
    rect(...a) { checkFiniteArgs('rect', a); calls.push('rect'); },
    moveTo(...a) { checkFiniteArgs('moveTo', a); calls.push('moveTo'); },
    lineTo(...a) { checkFiniteArgs('lineTo', a); calls.push('lineTo'); },
    quadraticCurveTo(...a) { checkFiniteArgs('quadraticCurveTo', a); calls.push('quadraticCurveTo'); },
    arc(...a) { checkFiniteArgs('arc', a); calls.push('arc'); },
    ellipse(...a) { checkFiniteArgs('ellipse', a); calls.push('ellipse'); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    clip() { calls.push('clip'); },
    drawImage(...a) { checkFiniteArgs('drawImage', a.slice(1)); calls.push('drawImage'); },
    createLinearGradient(...a) {
      checkFiniteArgs('createLinearGradient', a);
      return { addColorStop() {} };
    },
    measureText(text) {
      return { width: Array.from(String(text || '')).length * 10 };
    },
    fillText(text, ...a) {
      checkFiniteArgs('fillText', a);
      textsDrawn.push(String(text));
      calls.push('fillText');
    }
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext(kind) {
      return kind === '2d' ? ctx : null;
    },
    toBlob(cb, mime) {
      if (options.throwSecurityError) {
        const err = new Error('Tainted canvas');
        err.name = 'SecurityError';
        throw err;
      }
      if (options.returnNullBlob) {
        cb(null);
        return;
      }
      if (options.neverResolve) {
        return;
      }
      cb(new Blob(['fake-png-bytes'], { type: mime || 'image/png' }));
    }
  };

  return { canvas, calls, textsDrawn, fontsUsed };
}

describe('poster.js — desenho seguro Canvas 2D e codificação PNG', () => {
  it('renderiza pôster 1080x1350 com capa local Blob, fecha bitmap e desenha selo Hall da Fama em 9,0', async () => {
    const harness = createFakeCanvasHarness();
    let bitmapClosed = false;
    const coverBlob = new Blob(['webp-bytes'], { type: 'image/webp' });
    const db = {
      async get(store, key) {
        if (store === 'covers' && key === 'cover:game:1') {
          return coverBlob;
        }
        return null;
      }
    };

    const work = {
      id: 'rawg:1',
      type: 'game',
      title: 'Shadow of the Colossus: Edição Especial 🏆🔥',
      year: 2005,
      genre: 'Ação, Aventura',
      studio: 'Team Ico',
      soundtrack: 'Kow Otani',
      cover: 'cover:game:1',
      palette: ['#2B4C5E', '#D8834E'],
      scores: {
        geral: 9.0,
        historia: 9,
        gameplay_ritmo: 8.5,
        graficos_fotografia: 9.5,
        trilha: 10,
        direcao_arte: 10
      },
      status: 'completed',
      verdict: 'Obra monumental sobre solidão e escala.'
    };

    const result = await renderPoster(work, createFakeTheme(), {
      db,
      createCanvas: () => harness.canvas,
      decodeBlob: async () => ({
        source: { width: 600, height: 900 },
        close: () => {
          bitmapClosed = true;
        }
      })
    });

    assert.equal(harness.canvas.width, 1080);
    assert.equal(harness.canvas.height, 1350);
    assert.ok(result.blob instanceof Blob);
    assert.equal(result.warning, null);
    assert.equal(bitmapClosed, true);
    assert.ok(harness.calls.includes('drawImage'), 'Deve desenhar a capa local decodificada');
    assert.ok(harness.textsDrawn.some((t) => t.includes('HALL DA FAMA')));
  });

  it('NÃO desenha selo Hall da Fama em nota 8,5 e funciona sem capa, sem paleta e com título extremo', async () => {
    const harness = createFakeCanvasHarness();
    let fetchCalled = false;

    const work = {
      id: 'manual:1',
      type: 'movie',
      title: 'Título Épico Acentuado 🚀 '.repeat(12),
      cover: 'https://externo.inseguro.example/capa.jpg',
      scores: { geral: 8.5, historia: 8.5, gameplay_ritmo: 8, graficos_fotografia: 9, trilha: 8.5, direcao_arte: 8.5 },
      status: 'completed',
      verdict: ''
    };

    const result = await renderPoster(work, createFakeTheme(), {
      createCanvas: () => harness.canvas,
      fetchFn: async () => {
        fetchCalled = true;
        return new Response('nope');
      }
    });

    assert.equal(fetchCalled, false, 'Nunca deve fazer fetch em URL externa durante renderPoster');
    assert.equal(harness.calls.includes('drawImage'), false, 'Deve cair no placeholder quando capa externa é bloqueada');
    assert.equal(harness.textsDrawn.some((t) => t.includes('HALL DA FAMA')), false);
    assert.ok(result.warning && result.warning.includes('R2'));
    assert.equal(isSafeLocalCoverPath('https://site.com/a.jpg'), false);
    assert.equal(isSafeLocalCoverPath('covers/exemplo.webp'), true);
  });

  it('trata blob nulo, SecurityError (tainted canvas) e timeout com PosterExportError tipado', async () => {
    const work = { id: 'manual:2', type: 'anime', title: 'Akira', scores: { geral: 9.0 } };

    const nullHarness = createFakeCanvasHarness({ returnNullBlob: true });
    await assert.rejects(
      () => renderPoster(work, createFakeTheme(), { createCanvas: () => nullHarness.canvas }),
      (err) => err instanceof PosterExportError && err.code === 'BLOB_EMPTY'
    );

    const taintedHarness = createFakeCanvasHarness({ throwSecurityError: true });
    await assert.rejects(
      () => renderPoster(work, createFakeTheme(), { createCanvas: () => taintedHarness.canvas }),
      (err) => err instanceof PosterExportError && err.code === 'TAINTED_CANVAS'
    );

    const timeoutHarness = createFakeCanvasHarness({ neverResolve: true });
    await assert.rejects(
      () => renderPoster(work, createFakeTheme(), { createCanvas: () => timeoutHarness.canvas, timeoutMs: 20 }),
      (err) => err instanceof PosterExportError && err.code === 'EXPORT_TIMEOUT'
    );
  });

  it('varredura estática em js/export/*: sem Math.random, sem new Image com src externo e sem innerHTML', async () => {
    const exportDir = path.join(ROOT_DIR, 'js/export');
    const files = await readdir(exportDir);
    assert.ok(files.length >= 4);

    for (const file of files) {
      if (!file.endsWith('.js')) {
        continue;
      }
      const raw = await readFile(path.join(exportDir, file), 'utf8');
      assert.equal(/Math\.random\s*\(/.test(raw), false, `Math.random encontrado em js/export/${file}`);
      assert.equal(/innerHTML/.test(raw), false, `innerHTML encontrado em js/export/${file}`);
      assert.equal(/new\s+Image\s*\(/.test(raw), false, `new Image() encontrado em js/export/${file}`);
      assert.equal(/localStorage/.test(raw), false, `localStorage encontrado em js/export/${file}`);
    }
  });
});

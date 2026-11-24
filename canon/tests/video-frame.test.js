import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../js/mascots/engine.js';
import { buildTimeline } from '../js/export/timeline.js';
import {
  VIDEO_HEIGHT,
  VIDEO_SAFE_BOTTOM,
  VIDEO_SAFE_TOP,
  VIDEO_WIDTH,
  computeVideoLayout
} from '../js/export/layout.js';
import {
  advanceMascotWorldForFrame,
  createVideoMascotWorld,
  drawFrame,
  resolveSafeCoverBlob
} from '../js/export/video-frame.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeWork(overrides = {}) {
  return {
    id: 'anilist:20',
    type: 'anime',
    title: 'Mushishi: Zoku Shou Special Edition Extra Long Title Test',
    year: 2014,
    genre: 'Mistério / Fantasia',
    studio: 'Artland',
    director: 'Hiroshi Nagahama',
    soundtrack: 'Toshio Masuda',
    starring: 'Yuto Nakano',
    palette: ['#264653', '#E76F51'],
    scores: {
      geral: 9.2,
      historia: 9.5,
      gameplay_ritmo: 8.5,
      graficos_fotografia: 9.0,
      trilha: 9.5,
      direcao_arte: 10
    },
    pros: ['Atmosfera contemplativa'],
    cons: ['Ritmo lento'],
    status: 'completed',
    verdict: 'Contemplação rara em cada episódio.',
    ...overrides
  };
}

function makeFakeTheme() {
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

function createRecordingCtx() {
  const calls = [];
  let fillStyle = '';
  let strokeStyle = '';
  let font = '';
  let lineWidth = 1;
  let globalAlpha = 1;
  let textAlign = 'left';
  let textBaseline = 'top';

  const assertFiniteNums = (op, args) => {
    for (const arg of args) {
      if (typeof arg === 'number') {
        assert.ok(Number.isFinite(arg), `Número não finito em ${op}: ${arg}`);
      }
    }
  };

  const record = (op, ...args) => {
    assertFiniteNums(op, args);
    calls.push([op, ...args]);
  };

  return {
    calls,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(val) {
      fillStyle = val;
      calls.push(['set:fillStyle', typeof val === 'string' ? val : 'gradient']);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(val) {
      strokeStyle = val;
      calls.push(['set:strokeStyle', val]);
    },
    get font() {
      return font;
    },
    set font(val) {
      font = val;
      calls.push(['set:font', val]);
    },
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(val) {
      assertFiniteNums('lineWidth', [val]);
      lineWidth = val;
      calls.push(['set:lineWidth', val]);
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(val) {
      assertFiniteNums('globalAlpha', [val]);
      globalAlpha = val;
      calls.push(['set:globalAlpha', val]);
    },
    get textAlign() {
      return textAlign;
    },
    set textAlign(val) {
      textAlign = val;
      calls.push(['set:textAlign', val]);
    },
    get textBaseline() {
      return textBaseline;
    },
    set textBaseline(val) {
      textBaseline = val;
      calls.push(['set:textBaseline', val]);
    },
    save: () => record('save'),
    restore: () => record('restore'),
    clearRect: (...a) => record('clearRect', ...a),
    fillRect: (...a) => record('fillRect', ...a),
    strokeRect: (...a) => record('strokeRect', ...a),
    beginPath: () => record('beginPath'),
    closePath: () => record('closePath'),
    moveTo: (...a) => record('moveTo', ...a),
    lineTo: (...a) => record('lineTo', ...a),
    quadraticCurveTo: (...a) => record('quadraticCurveTo', ...a),
    bezierCurveTo: (...a) => record('bezierCurveTo', ...a),
    arc: (...a) => record('arc', ...a),
    ellipse: (...a) => record('ellipse', ...a),
    rect: (...a) => record('rect', ...a),
    clip: () => record('clip'),
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    translate: (...a) => record('translate', ...a),
    rotate: (...a) => record('rotate', ...a),
    scale: (...a) => record('scale', ...a),
    fillText: (t, x, y) => record('fillText', t, x, y),
    drawImage: (_img, ...a) => record('drawImage', ...a),
    measureText: (txt) => ({ width: String(txt || '').length * 10 }),
    createLinearGradient: (x0, y0, x1, y1) => {
      assertFiniteNums('createLinearGradient', [x0, y0, x1, y1]);
      return {
        addColorStop(offset, color) {
          assertFiniteNums('addColorStop', [offset]);
          calls.push(['gradient:stop', offset, color]);
        }
      };
    }
  };
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

describe('video-frame.js — layout 1080x1920, determinismo, mascotes e R2', () => {
  it('layout 1080x1920 respeita margens seguras >= 250px e tem retângulos disjuntos', () => {
    const layout = computeVideoLayout(makeWork());
    assert.equal(layout.width, VIDEO_WIDTH);
    assert.equal(layout.height, VIDEO_HEIGHT);
    assert.equal(VIDEO_WIDTH, 1080);
    assert.equal(VIDEO_HEIGHT, 1920);
    assert.ok(layout.safeTop >= 250);
    assert.ok(layout.safeBottom >= 250);

    const regions = [
      layout.headerRect,
      layout.coverRect,
      layout.titleRect,
      layout.specsRect,
      layout.scoreRect,
      layout.barsRect,
      layout.mascotRect,
      layout.footerRect
    ].filter(Boolean);

    for (const r of regions) {
      assert.ok(r.y >= VIDEO_SAFE_TOP, `Região acima da margem segura superior: y=${r.y}`);
      assert.ok(r.y + r.height <= VIDEO_HEIGHT - VIDEO_SAFE_BOTTOM, `Região abaixo da margem segura inferior: y2=${r.y + r.height}`);
    }

    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        assert.equal(
          rectsOverlap(regions[i], regions[j]),
          false,
          `Retângulos sobrepostos: ${JSON.stringify(regions[i])} e ${JSON.stringify(regions[j])}`
        );
      }
    }
  });

  it('desenha quadro com notas 0..10, com e sem capa, título longo e registro determinístico', async () => {
    const src = await readFile(path.join(ROOT_DIR, 'js/export/video-frame.js'), 'utf8');
    assert.equal(src.includes('Math.random'), false);
    assert.equal(src.includes('Date.now'), false);
    assert.equal(src.includes('performance.now'), false);
    assert.equal(src.includes('innerHTML'), false);

    const theme = makeFakeTheme();
    for (const score of [0, 4.5, 8.5, 9.0, 10]) {
      const work = makeWork({
        scores: {
          geral: score,
          historia: score,
          gameplay_ritmo: score,
          graficos_fotografia: score,
          trilha: score,
          direcao_arte: score
        }
      });
      const layout = computeVideoLayout(work);
      const tl = buildTimeline(work);
      const state = tl.stateAt(5.9);
      const worldA = createVideoMascotWorld(work);
      const worldB = createVideoMascotWorld(work);
      advanceMascotWorldForFrame(worldA, state.mascotInputs, 60, 1);
      advanceMascotWorldForFrame(worldB, state.mascotInputs, 60, 1);

      const ctx1 = createRecordingCtx();
      const ctx2 = createRecordingCtx();

      drawFrame(ctx1, { coverImage: { width: 600, height: 900 }, mascotWorld: worldA }, layout, theme, state);
      drawFrame(ctx2, { coverImage: { width: 600, height: 900 }, mascotWorld: worldB }, layout, theme, state);

      assert.deepEqual(ctx1.calls, ctx2.calls, `Não determinístico para nota ${score}`);

      // Sem capa também deve funcionar sem exceção (usa gradiente placeholder, sem drawImage)
      const ctxNoCover = createRecordingCtx();
      drawFrame(ctxNoCover, { coverImage: null, mascotWorld: worldA }, layout, theme, state);
      assert.ok(ctxNoCover.calls.some(([op]) => op === 'gradient:stop'));
      assert.equal(ctxNoCover.calls.some(([op]) => op === 'drawImage'), false);
    }
  });

  it('bloqueia URL externa de capa (R2) sem fazer rede', async () => {
    let fetchCalled = false;
    const lookup = await resolveSafeCoverBlob(
      makeWork({ cover: 'https://evil.example.com/cover.jpg' }),
      {
        fetchFn: async () => {
          fetchCalled = true;
          throw new Error('Não deve buscar URL externa');
        }
      }
    );
    assert.equal(fetchCalled, false);
    assert.equal(lookup.blob, null);
    assert.match(lookup.warning, /bloqueada/i);
  });

  it('avança o mundo dos mascotes em passo fixo 1/60 (2 passos por quadro em 30 fps)', () => {
    const work = makeWork();
    const w60 = createVideoMascotWorld(work);
    const w30 = createVideoMascotWorld(work);

    const inputs = {
      contextKind: 'video',
      title: work.title,
      scores: work.scores,
      palette: work.palette,
      savedPulse: true
    };

    advanceMascotWorldForFrame(w60, inputs, 60, 0);
    advanceMascotWorldForFrame(w60, inputs, 60, 1);
    advanceMascotWorldForFrame(w60, inputs, 60, 2);

    advanceMascotWorldForFrame(w30, inputs, 30, 0);
    advanceMascotWorldForFrame(w30, inputs, 30, 1);

    assert.deepEqual(snapshot(w30), snapshot(w60));
  });
});

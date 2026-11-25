import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLINK_DURATION,
  BLINK_MAX_INTERVAL,
  BLINK_MIN_INTERVAL,
  FIXED_DT,
  MASCOT_IDS,
  advance,
  createWorld,
  drawWorld,
  getBlinkInterval,
  resolveMascotInk,
  setInputs,
  setPointer,
  snapshot,
  triggerMascotImpulse
} from '../js/mascots/engine.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertAllNumbersFinite(value, trail = 'root') {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true, `Número não finito em ${trail}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertAllNumbersFinite(item, `${trail}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertAllNumbersFinite(v, `${trail}.${k}`);
    }
  }
}

function createFakeCanvasContext() {
  const calls = [];
  const assertFiniteArgs = (method, args) => {
    for (const arg of args) {
      if (typeof arg === 'number') {
        assert.equal(Number.isFinite(arg), true, `Arg não finito em ctx.${method}: ${arg}`);
      }
    }
    calls.push({ method, args });
  };

  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    clearRect: (...a) => assertFiniteArgs('clearRect', a),
    save: (...a) => assertFiniteArgs('save', a),
    restore: (...a) => assertFiniteArgs('restore', a),
    translate: (...a) => assertFiniteArgs('translate', a),
    rotate: (...a) => assertFiniteArgs('rotate', a),
    scale: (...a) => assertFiniteArgs('scale', a),
    beginPath: (...a) => assertFiniteArgs('beginPath', a),
    closePath: (...a) => assertFiniteArgs('closePath', a),
    moveTo: (...a) => assertFiniteArgs('moveTo', a),
    lineTo: (...a) => assertFiniteArgs('lineTo', a),
    arc: (...a) => assertFiniteArgs('arc', a),
    rect: (...a) => assertFiniteArgs('rect', a),
    fill: (...a) => assertFiniteArgs('fill', a),
    stroke: (...a) => assertFiniteArgs('stroke', a),
    fillRect: (...a) => assertFiniteArgs('fillRect', a),
    strokeRect: (...a) => assertFiniteArgs('strokeRect', a)
  };
}

const SAMPLE_THEME = Object.freeze({
  ink: '#16202C',
  paper: '#FAF6EB',
  surface: '#E5DEC9',
  accent: '#B33927',
  glow: '#D47420',
  crack: '#A12020',
  workA: '#264653',
  workB: '#E76F51'
});

describe('mascots/engine.js — determinismo, mapeamento, física e desenho', () => {
  it('produz snapshot idêntico com mesma semente e varia apenas o pseudoaleatório com semente diferente', () => {
    const w1 = createWorld({ seed: 42 });
    const w2 = createWorld({ seed: 42 });
    const w3 = createWorld({ seed: 999 });

    const inputs = {
      contextKind: 'form',
      title: 'Teste',
      scores: { geral: 9.5, historia: 9.5, gameplay_ritmo: 9.0, graficos_fotografia: 9.5, trilha: 10 },
      palette: ['#1D3557', '#E63946']
    };

    setInputs(w1, inputs);
    setInputs(w2, inputs);
    setInputs(w3, inputs);
    triggerMascotImpulse(w1, 'koma');
    triggerMascotImpulse(w2, 'koma');
    triggerMascotImpulse(w3, 'koma');

    for (let i = 0; i < 60; i += 1) {
      advance(w1, FIXED_DT);
      advance(w2, FIXED_DT);
      advance(w3, FIXED_DT);
    }

    assert.deepEqual(snapshot(w1), snapshot(w2));
    assert.notDeepEqual(snapshot(w1).koma.impactRays, snapshot(w3).koma.impactRays);
    assert.deepEqual(snapshot(w1).save, snapshot(w3).save);
  });

  it('respeita todos os limiares do KOMA (4.9, 5.0, 5.9, 6.0, 8.9, 9.0, 10)', () => {
    const w = createWorld({ seed: 7 });

    const expectMode = (geral, expectedMode) => {
      setInputs(w, { scores: { geral, historia: 7, gameplay_ritmo: 7, graficos_fotografia: 7, trilha: 7 } });
      assert.equal(w.koma.mode, expectedMode, `geral=${geral} deveria ser ${expectedMode}`);
    };

    expectMode(4.9, 'crack');
    assert.ok(w.koma.crackLevel > 0);

    expectMode(5.0, 'neutral');
    assert.equal(w.koma.crackLevel, 0);
    assert.equal(w.koma.impactIntensity, 0);
    assert.equal(w.koma.tilt.target, 0);

    expectMode(5.9, 'neutral');
    expectMode(6.0, 'tilt');
    const tiltAt6 = w.koma.tilt.target;
    expectMode(8.9, 'tilt');
    assert.ok(w.koma.tilt.target > tiltAt6);

    expectMode(9.0, 'impact');
    assert.ok(w.koma.impactIntensity > 0);
    expectMode(10, 'impact');
  });

  it('normaliza apenas a nota geral e os 4 critérios ativos, ignorando direcao_arte', () => {
    const w = createWorld({ seed: 3 });
    assert.deepEqual(Object.keys(snapshot(w).inputs.scores).sort(), [
      'gameplay_ritmo',
      'geral',
      'graficos_fotografia',
      'historia',
      'trilha'
    ]);

    setInputs(w, {
      scores: { geral: 8, historia: 8, gameplay_ritmo: 8, graficos_fotografia: 8, trilha: 8, direcao_arte: 10 }
    });
    assert.equal('direcao_arte' in snapshot(w).inputs.scores, false);
    assertAllNumbersFinite(snapshot(w));
  });

  it('ativa combo ECHO somente com Trilha Sonora 10 + História 10, SAVE Hall da Fama >= 9.0 e KINO reage à mudança', () => {
    const w = createWorld({ seed: 10 });
    const base = { geral: 9.0, historia: 9, gameplay_ritmo: 8, graficos_fotografia: 8, trilha: 9 };

    setInputs(w, { scores: { ...base, geral: 8.5 } });
    assert.equal(w.echo.comboActive, false);
    assert.equal(w.save.hallOfFame, false);

    // Só História em 10 -> sem combo
    setInputs(w, { scores: { ...base, historia: 10 } });
    assert.equal(w.echo.comboActive, false);
    assert.equal(w.save.hallOfFame, true);

    // Só Trilha Sonora em 10 -> sem combo
    setInputs(w, { scores: { ...base, trilha: 10 } });
    assert.equal(w.echo.comboActive, false);

    // Gameplay e Gráficos em 10 não formam combo sem História + Trilha
    setInputs(w, { scores: { ...base, gameplay_ritmo: 10, graficos_fotografia: 10 } });
    assert.equal(w.echo.comboActive, false);

    // Direção de Arte legada em 10 é ignorada, mesmo com Trilha em 10
    setInputs(w, { scores: { ...base, trilha: 10, direcao_arte: 10 } });
    assert.equal(w.echo.comboActive, false);

    // História 10 + Trilha 10 -> combo
    setInputs(w, { scores: { ...base, historia: 10, trilha: 10 } });
    assert.equal(w.echo.comboActive, true);

    // Perder uma das duas desativa o combo
    setInputs(w, { scores: { ...base, historia: 9.5, trilha: 10 } });
    assert.equal(w.echo.comboActive, false);

    // KINO pisca ao alterar gameplay_ritmo ou graficos_fotografia (após decair o flash anterior)
    for (let i = 0; i < 30; i += 1) {
      advance(w, FIXED_DT);
    }
    assert.equal(w.kino.shutterFlash, 0);
    setInputs(w, { scores: { ...base, historia: 10, trilha: 10, gameplay_ritmo: 9.5 } });
    assert.equal(w.kino.shutterFlash, 1);
  });

  it('converge molas e mantém todos os valores finitos mesmo com notas extremas e dt extremos', () => {
    const w = createWorld({ seed: 5 });
    setInputs(w, {
      scores: { geral: 10, historia: 10, gameplay_ritmo: 10, graficos_fotografia: 10, trilha: 10 },
      savedPulse: true
    });

    // dt extremos não quebram nem geram NaN/Infinity
    advance(w, NaN);
    advance(w, -5);
    advance(w, 999);
    assertAllNumbersFinite(snapshot(w));

    // Convergência após 2 segundos simulados
    for (let i = 0; i < 120; i += 1) {
      advance(w, FIXED_DT);
    }
    const snap = snapshot(w);
    assertAllNumbersFinite(snap);
    assert.ok(Math.abs(snap.koma.tilt.x - snap.koma.tilt.target) < 0.05);
    assert.ok(Math.abs(snap.kino.aperture.x - snap.kino.aperture.target) < 0.05);
  });

  it('desenha os 4 mascotes com ctx falso apenas com chamadas canvas 2D válidas para notas 0..10', () => {
    for (const score of [0, 4.5, 5.5, 7.5, 9.0, 10]) {
      const w = createWorld({ seed: 11 });
      setInputs(w, {
        scores: {
          geral: score,
          historia: score,
          gameplay_ritmo: score,
          graficos_fotografia: score,
          trilha: score
        },
        savedPulse: score >= 9
      });
      setPointer(w, score / 5 - 1, 1 - score / 5);
      advance(w, FIXED_DT * 3);
      const fakeCtx = createFakeCanvasContext();
      drawWorld(fakeCtx, w, { width: 640, height: 120 }, SAMPLE_THEME);
      assert.ok(fakeCtx.calls.length > 20);
    }
  });

  it('aceita tinta opcional por mascote no tema com fallback para a cor de acento', () => {
    assert.equal(resolveMascotInk(SAMPLE_THEME, 'koma'), SAMPLE_THEME.accent);
    const themed = { ...SAMPLE_THEME, komaInk: '#112233', echoInk: '' };
    assert.equal(resolveMascotInk(themed, 'koma'), '#112233');
    assert.equal(resolveMascotInk(themed, 'echo'), SAMPLE_THEME.accent);
    assert.equal(resolveMascotInk(themed, 'kino'), SAMPLE_THEME.accent);

    const w = createWorld({ seed: 2 });
    const fakeCtx = createFakeCanvasContext();
    drawWorld(fakeCtx, w, { width: 640, height: 120 }, themed);
    assert.ok(fakeCtx.calls.length > 20);
  });

  it('js/mascots/* não usa Math.random, Date.now, performance.now nem arquivos de áudio externos', async () => {
    const dir = path.join(ROOT_DIR, 'js', 'mascots');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const raw = await readFile(path.join(dir, file), 'utf8');
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.equal(/\bMath\.random\b/.test(stripped), false, `Math.random em ${file}`);
      assert.equal(/\bDate\.now\b/.test(stripped), false, `Date.now em ${file}`);
      assert.equal(/\bperformance\.now\b/.test(stripped), false, `performance.now em ${file}`);
      assert.equal(/\.(mp3|wav|ogg|m4a)\b/i.test(stripped), false, `Referência a áudio externo em ${file}`);
    }
  });
});

describe('mascots/engine.js — olhar, ponteiro e piscadas', () => {
  it('rastreia o ponteiro com olhar finito, mirando cada mascote a partir da sua célula', () => {
    const w = createWorld({ seed: 21 });
    setPointer(w, 0.8, -0.5);
    assert.deepEqual(snapshot(w).pointer, { active: true, x: 0.8, y: -0.5 });

    for (let i = 0; i < 180; i += 1) {
      advance(w, FIXED_DT);
    }
    const snap = snapshot(w);
    assertAllNumbersFinite(snap);

    for (const id of MASCOT_IDS) {
      assert.ok(snap[id].eyes.gaze.y.x < -0.2, `${id} deve olhar para cima (y negativo)`);
      assert.ok(Math.abs(snap[id].eyes.gaze.x.x - snap[id].eyes.gaze.x.target) < 0.05);
    }
    assert.ok(snap.koma.eyes.gaze.x.x > snap.echo.eyes.gaze.x.x, 'KOMA (à esquerda) olha mais para a direita que ECHO');
    assert.ok(snap.koma.eyes.gaze.x.x > 0.8);
  });

  it('sanitiza ponteiro inválido ou fora do intervalo mantendo todo o estado finito', () => {
    const w = createWorld({ seed: 22 });

    setPointer(w, 5, -9);
    assert.deepEqual(snapshot(w).pointer, { active: true, x: 1, y: -1 });

    const invalidInputs = [
      [Number.NaN, 0.2],
      [0.1, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 0],
      ['0.5', 0.5],
      [undefined, undefined],
      [null, null]
    ];
    for (const [x, y] of invalidInputs) {
      setPointer(w, 0.3, 0.3);
      assert.equal(snapshot(w).pointer.active, true);
      setPointer(w, x, y);
      assert.deepEqual(snapshot(w).pointer, { active: false, x: 0, y: 0 }, `entrada inválida: ${String(x)}, ${String(y)}`);
      for (let i = 0; i < 30; i += 1) {
        advance(w, FIXED_DT);
      }
      assertAllNumbersFinite(snapshot(w));
    }

    setPointer(w, 1e308, -1e308);
    advance(w, 999);
    assertAllNumbersFinite(snapshot(w));
  });

  it('faz deriva leve e determinística sem ponteiro, dependente apenas do tempo simulado', () => {
    const a = createWorld({ seed: 1 });
    const b = createWorld({ seed: 987654 });

    for (let i = 0; i < 150; i += 1) {
      advance(a, FIXED_DT);
      advance(b, FIXED_DT);
    }

    for (const id of MASCOT_IDS) {
      assert.deepEqual(snapshot(a)[id].eyes.gaze, snapshot(b)[id].eyes.gaze, `deriva de ${id} não depende da semente`);
    }

    const snap = snapshot(a);
    assertAllNumbersFinite(snap);
    const gazes = MASCOT_IDS.map((id) => snap[id].eyes.gaze.x.x);
    assert.ok(gazes.some((g) => Math.abs(g) > 0.02), 'a deriva deve mover o olhar');
    assert.ok(gazes.every((g) => Math.abs(g) < 0.6), 'a deriva deve ser leve');
    assert.equal(new Set(gazes.map((g) => g.toFixed(4))).size > 1, true, 'mascotes derivam de forma distinta');

    setPointer(a, 0.5, 0.5);
    setPointer(a, null, null);
    assert.equal(snapshot(a).pointer.active, false);
  });

  it('mantém paridade física entre 60 fps e 30 fps para olhar e piscadas', () => {
    const fps60 = createWorld({ seed: 31 });
    const fps30 = createWorld({ seed: 31 });
    setPointer(fps60, -0.4, 0.3);
    setPointer(fps30, -0.4, 0.3);

    for (let i = 0; i < 600; i += 1) {
      advance(fps60, 1 / 60);
    }
    for (let i = 0; i < 300; i += 1) {
      advance(fps30, 1 / 30);
    }

    const s60 = snapshot(fps60);
    const s30 = snapshot(fps30);
    assert.equal(s60.time, s30.time);
    for (const id of MASCOT_IDS) {
      assert.deepEqual(s60[id].eyes, s30[id].eyes, `olhos de ${id} devem coincidir entre 60 e 30 fps`);
    }
  });

  it('calcula piscadas por função pura, assíncronas por mascote e independentes da semente', () => {
    for (let index = 0; index < 4; index += 1) {
      for (let count = 0; count < 50; count += 1) {
        const interval = getBlinkInterval(index, count);
        assert.equal(interval, getBlinkInterval(index, count));
        assert.ok(interval >= BLINK_MIN_INTERVAL && interval <= BLINK_MAX_INTERVAL);
      }
    }
    assert.notEqual(getBlinkInterval(0, 0), getBlinkInterval(1, 0));
    assert.notEqual(getBlinkInterval(0, 0), getBlinkInterval(0, 1));
    assert.equal(Number.isFinite(getBlinkInterval(Number.NaN, Number.NaN)), true);

    const worlds = [1, 42, 999999].map((seed) => createWorld({ seed }));
    let sawBlinkClosed = false;
    for (let i = 0; i < 1200; i += 1) {
      for (const w of worlds) {
        advance(w, FIXED_DT);
      }
      if (worlds[0].koma.eyes.blink.openness < 0.2) {
        sawBlinkClosed = true;
      }
    }
    assert.equal(sawBlinkClosed, true, 'KOMA deve fechar os olhos em 20 s simulados');

    const [s1, s2, s3] = worlds.map((w) => snapshot(w));
    for (const id of MASCOT_IDS) {
      assert.deepEqual(s1[id].eyes.blink, s2[id].eyes.blink);
      assert.deepEqual(s1[id].eyes.blink, s3[id].eyes.blink);
      assert.ok(s1[id].eyes.blink.count >= 2, `${id} deve ter piscado ao menos 2 vezes em 20 s`);
    }
    assert.deepEqual(s1.save, s3.save, 'estado do SAVE idêntico com sementes diferentes');
    assert.notDeepEqual(s1.koma.impactRays, s3.koma.impactRays);

    const firstBlinks = MASCOT_IDS.map((_, index) => getBlinkInterval(index, 0));
    assert.equal(new Set(firstBlinks).size, 4, 'primeira piscada de cada mascote em instantes distintos');
    assert.ok(BLINK_DURATION > 0 && BLINK_DURATION < BLINK_MIN_INTERVAL);
  });
});

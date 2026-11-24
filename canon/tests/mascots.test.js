import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIXED_DT,
  advance,
  createWorld,
  drawWorld,
  setInputs,
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
      scores: { geral: 9.5, historia: 9.5, gameplay_ritmo: 9.0, graficos_fotografia: 9.5, trilha: 10, direcao_arte: 10 },
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
      setInputs(w, { scores: { geral, historia: 7, gameplay_ritmo: 7, graficos_fotografia: 7, trilha: 7, direcao_arte: 7 } });
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

  it('ativa combo ECHO somente com >= 2 critérios em 10, SAVE Hall da Fama >= 9.0 e KINO reage à mudança', () => {
    const w = createWorld({ seed: 10 });

    // 0 critérios em 10
    setInputs(w, { scores: { geral: 8.5, historia: 9, gameplay_ritmo: 8, graficos_fotografia: 8, trilha: 9, direcao_arte: 9 } });
    assert.equal(w.echo.comboActive, false);
    assert.equal(w.save.hallOfFame, false);

    // 1 critério em 10 -> combo ainda false
    setInputs(w, { scores: { geral: 9.0, historia: 10, gameplay_ritmo: 8, graficos_fotografia: 8, trilha: 9, direcao_arte: 9 } });
    assert.equal(w.echo.comboActive, false);
    assert.equal(w.save.hallOfFame, true);

    // 2 critérios em 10 -> combo true
    setInputs(w, { scores: { geral: 9.0, historia: 10, gameplay_ritmo: 8, graficos_fotografia: 8, trilha: 10, direcao_arte: 9 } });
    assert.equal(w.echo.comboActive, true);

    // KINO pisca ao alterar gameplay_ritmo ou graficos_fotografia (após decair o flash anterior)
    for (let i = 0; i < 30; i += 1) {
      advance(w, FIXED_DT);
    }
    assert.equal(w.kino.shutterFlash, 0);
    setInputs(w, { scores: { geral: 9.0, historia: 10, gameplay_ritmo: 9.5, graficos_fotografia: 8, trilha: 10, direcao_arte: 9 } });
    assert.equal(w.kino.shutterFlash, 1);
  });

  it('converge molas e mantém todos os valores finitos mesmo com notas extremas e dt extremos', () => {
    const w = createWorld({ seed: 5 });
    setInputs(w, {
      scores: { geral: 10, historia: 10, gameplay_ritmo: 10, graficos_fotografia: 10, trilha: 10, direcao_arte: 10 },
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
          trilha: score,
          direcao_arte: score
        },
        savedPulse: score >= 9
      });
      advance(w, FIXED_DT * 3);
      const fakeCtx = createFakeCanvasContext();
      drawWorld(fakeCtx, w, { width: 640, height: 120 }, SAMPLE_THEME);
      assert.ok(fakeCtx.calls.length > 20);
    }
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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION_SEC, buildTimeline } from '../js/export/timeline.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeWork(geral = 9.2) {
  return {
    id: 'rawg:1',
    type: 'game',
    title: 'Disco Elysium',
    year: 2019,
    genre: 'RPG',
    studio: 'ZA/UM',
    director: 'Robert Kurvitz',
    soundtrack: 'British Sea Power',
    starring: 'Harry Du Bois',
    palette: ['#264653', '#E76F51'],
    scores: {
      geral,
      historia: 10,
      gameplay_ritmo: 8.5,
      graficos_fotografia: 9.0,
      trilha: 9.5,
      direcao_arte: 9.5
    },
    pros: ['Escrita brilhante'],
    cons: ['Ritmo lento'],
    status: 'completed',
    verdict: 'Obra-prima narrativa.'
  };
}

function assertAllFinite(obj, label = 'state') {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `${label} não finito: ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertAllFinite(v, `${label}[${i}]`));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' || Array.isArray(v) || (v && typeof v === 'object')) {
        assertAllFinite(v, `${label}.${k}`);
      }
    }
  }
}

describe('timeline.js — determinismo, áudio e sincronia pura', () => {
  it('é 100% puro e determinístico para chamadas repetidas', async () => {
    const src = await readFile(path.join(ROOT_DIR, 'js/export/timeline.js'), 'utf8');
    assert.equal(src.includes('Math.random'), false);
    assert.equal(src.includes('Date.now'), false);
    assert.equal(src.includes('performance.now'), false);
    assert.equal(src.includes('document.'), false);

    const work = makeWork(9.4);
    const t1 = buildTimeline(work);
    const t2 = buildTimeline(work);

    assert.equal(t1.duration, VIDEO_DURATION_SEC);
    assert.deepEqual(t1.audioEvents, t2.audioEvents);
    for (const sampleT of [0, 0.5, 1.5, 3.2, 5.1, 6.8, 7.0]) {
      assert.deepEqual(t1.stateAt(sampleT), t2.stateAt(sampleT));
    }
  });

  it('mantém eventos de áudio estritamente ordenados dentro de [0, duração]', () => {
    const tl = buildTimeline(makeWork(9.0));
    assert.ok(tl.audioEvents.length >= 12);

    let prevT = -1;
    for (const evt of tl.audioEvents) {
      assert.ok(evt.t >= 0 && evt.t < tl.duration, `Evento fora de [0, duração): ${evt.t}`);
      assert.ok(evt.t >= prevT, `Eventos fora de ordem: ${prevT} -> ${evt.t}`);
      assert.equal(typeof evt.voz, 'string');
      prevT = evt.t;
    }

    assert.ok(tl.audioEvents.some((e) => e.voz === 'shutterClick' && e.t < 0.5));
    assert.ok(tl.audioEvents.some((e) => e.voz === 'sliderTick'));
    assert.ok(tl.audioEvents.some((e) => e.voz === 'paperSnap'));
    assert.ok(tl.audioEvents.some((e) => e.voz === 'echoTone'));
  });

  it('dispara acorde crystalChord no final SOMENTE quando geral >= 9,0 (8,5 não; 9,0 sim)', () => {
    const low = buildTimeline(makeWork(8.5));
    const exactBoundary = buildTimeline(makeWork(9.0));

    assert.equal(low.isHallOfFame, false);
    assert.equal(low.audioEvents.some((e) => e.voz === 'crystalChord'), false);
    assert.equal(low.stateAt(6.5).badgeProgress, 0);

    assert.equal(exactBoundary.isHallOfFame, true);
    assert.equal(exactBoundary.audioEvents.some((e) => e.voz === 'crystalChord'), true);
    assert.ok(exactBoundary.stateAt(6.5).badgeProgress > 0.9);
  });

  it('anima barras de 0 até a nota real sem nunca ultrapassá-la e mantém stateAt finito inclusive fora do intervalo', () => {
    const work = makeWork(8.0);
    const tl = buildTimeline(work);

    const s0 = tl.stateAt(0);
    for (const bar of s0.barsProgress) {
      assert.equal(bar.currentScore, 0);
      assert.equal(bar.ratio, 0);
    }

    for (let step = 0; step <= 70; step += 1) {
      const state = tl.stateAt(step * 0.1);
      assertAllFinite(state, `t=${step * 0.1}`);
      for (const bar of state.barsProgress) {
        assert.ok(bar.currentScore >= 0, 'nota da barra não pode ser negativa');
        assert.ok(bar.currentScore <= bar.targetScore + 1e-9, 'barra não pode ultrapassar a nota real');
      }
      assert.ok(state.currentGeralScore <= 8.0 + 1e-9);
    }

    const sEnd = tl.stateAt(tl.duration);
    for (const bar of sEnd.barsProgress) {
      assert.equal(bar.currentScore, bar.targetScore);
    }

    for (const weirdT of [-10, -0.01, 7.5, 999, Number.NaN, Number.POSITIVE_INFINITY]) {
      assertAllFinite(tl.stateAt(weirdT), `t=${weirdT}`);
    }
  });
});

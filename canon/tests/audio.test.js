import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderTimelineAudio } from '../js/audio/offline-render.js';
import {
  createTickThrottler,
  echoScoreToFrequency,
  playVoice
} from '../js/audio/synth.js';
import { createAudioController } from '../js/audio/unlock.js';
import { triggerHaptic } from '../js/mascots/haptics.js';

function createFakeAudioParam(log, label) {
  return {
    value: 0,
    setValueAtTime: (val, t) => log.push({ op: `${label}.setValueAtTime`, val, t }),
    linearRampToValueAtTime: (val, t) => log.push({ op: `${label}.linearRampToValueAtTime`, val, t }),
    exponentialRampToValueAtTime: (val, t) => log.push({ op: `${label}.exponentialRampToValueAtTime`, val, t })
  };
}

function createFakeAudioContext(initialState = 'suspended') {
  const log = [];
  let resumeCalls = 0;

  const ctx = {
    state: initialState,
    currentTime: 0,
    sampleRate: 44100,
    destination: { kind: 'destination' },
    log,
    getResumeCalls: () => resumeCalls,
    resume: () => {
      resumeCalls += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
    createGain: () => {
      const g = {
        gain: createFakeAudioParam(log, 'gain'),
        connect: () => {}
      };
      return g;
    },
    createDynamicsCompressor: () => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: () => {}
    }),
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: createFakeAudioParam(log, 'freq'),
        connect: () => {},
        start: (t) => log.push({ op: 'osc.start', t }),
        stop: (t) => log.push({ op: 'osc.stop', t })
      };
      return osc;
    },
    createBiquadFilter: () => ({
      type: 'bandpass',
      frequency: createFakeAudioParam(log, 'filterFreq'),
      Q: createFakeAudioParam(log, 'filterQ'),
      connect: () => {}
    }),
    createBuffer: (channels, length, sampleRate) => ({
      channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length)
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      start: (t) => log.push({ op: 'buf.start', t }),
      stop: (t) => log.push({ op: 'buf.stop', t })
    }),
    startRendering: async () => ({
      duration: 7,
      sampleRate: 44100,
      numberOfChannels: 2,
      log
    })
  };

  return ctx;
}

describe('audio & haptics — unlock, synth, throttle, offline-render', () => {
  it('unlock.js começa silenciado, chama resume() síncrono no gesto e trata estado interrupted', () => {
    const fakeCtx = createFakeAudioContext('suspended');
    const docListeners = new Map();
    const fakeDoc = {
      hidden: false,
      addEventListener: (ev, fn) => docListeners.set(ev, fn),
      removeEventListener: (ev) => docListeners.delete(ev)
    };

    const controller = createAudioController({
      createContext: () => fakeCtx,
      documentObj: fakeDoc
    });

    assert.equal(controller.isEnabled(), false);

    // Primeiro gesto ativa e chama resume() sincronamente
    const status1 = controller.toggleFromGesture();
    assert.equal(status1.enabled, true);
    assert.equal(fakeCtx.getResumeCalls(), 1);
    assert.equal(fakeCtx.state, 'running');

    // Simula iOS interrompendo áudio e retorno via visibilitychange
    fakeCtx.state = 'interrupted';
    fakeDoc.hidden = false;
    docListeners.get('visibilitychange')?.();
    assert.equal(fakeCtx.getResumeCalls(), 2);
    assert.equal(fakeCtx.state, 'running');

    // Novo gesto quando interrompido também retoma
    fakeCtx.state = 'interrupted';
    controller.ensureResumedInGesture();
    assert.equal(fakeCtx.getResumeCalls(), 3);
  });

  it('mapeia nota para oitava/frequência no ECHO e aplica throttle no tick', () => {
    const fLow = echoScoreToFrequency(1.0);
    const fMid = echoScoreToFrequency(5.0);
    const fHigh = echoScoreToFrequency(7.0);
    const fTop = echoScoreToFrequency(9.5);

    assert.ok(fLow < fMid && fMid < fHigh && fHigh < fTop);
    assert.equal(fMid, fLow * 2);
    assert.equal(fHigh, fLow * 4);
    assert.equal(fTop, fLow * 8);

    let clock = 100;
    const throttler = createTickThrottler({ intervalMs: 80, now: () => clock });
    assert.equal(throttler.canTriggerTick(), true);
    clock = 140;
    assert.equal(throttler.canTriggerTick(), false);
    clock = 185;
    assert.equal(throttler.canTriggerTick(), true);
  });

  it('synth.js usa rampas sem clipping e offline-render agenda vozes nos tempos exatos', async () => {
    const fakeOffline = createFakeAudioContext('running');

    const buffer = await renderTimelineAudio(
      [
        { t: 0.5, voice: 'koma' },
        { t: 1.25, voice: 'kino' },
        { t: 2.0, voice: 'echo', params: { score: 9.5 } },
        { t: 3.5, voice: 'save' },
        { t: 9.0, voice: 'save' } // fora da duração de 7s deve ser ignorado
      ],
      7,
      { createOfflineContext: () => fakeOffline }
    );

    assert.equal(buffer.duration, 7);
    const starts = fakeOffline.log.filter((e) => e.op === 'osc.start' || e.op === 'buf.start').map((e) => e.t);
    assert.ok(starts.includes(0.5));
    assert.ok(starts.includes(1.25));
    assert.ok(starts.includes(2.0));
    assert.ok(starts.includes(3.5));
    assert.equal(starts.includes(9.0), false);

    // Verifica que nenhuma voz gerou ganho exponencial iniciando em 0 literal
    const zeroExp = fakeOffline.log.filter(
      (e) => e.op.endsWith('exponentialRampToValueAtTime') && e.val <= 0
    );
    assert.equal(zeroExp.length, 0);

    // playVoice direto também funciona sem lançar exceção
    const liveFake = createFakeAudioContext('running');
    playVoice('tick', liveFake, 0.1, { score: 8 });
    assert.ok(liveFake.log.some((e) => e.op === 'osc.start' && e.t === 0.1));
  });

  it('haptics.js respeita som ativo, prefers-reduced-motion e ausência de navigator.vibrate', () => {
    const calls = [];
    const navWithVibrate = { vibrate: (p) => { calls.push(p); return true; } };

    assert.equal(triggerHaptic('tap', { enabled: false, navigatorObj: navWithVibrate }), false);
    assert.equal(triggerHaptic('tap', { enabled: true, reducedMotion: true, navigatorObj: navWithVibrate }), false);
    assert.equal(triggerHaptic('tap', { enabled: true, reducedMotion: false, navigatorObj: {} }), false);
    assert.equal(triggerHaptic('tap', { enabled: true, reducedMotion: false, navigatorObj: navWithVibrate }), true);
    assert.equal(calls.length, 1);
  });
});

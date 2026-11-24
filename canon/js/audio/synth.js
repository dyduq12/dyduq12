/**
 * Procedural Web Audio synthesizer (no external audio files).
 * Works identically on live AudioContext and OfflineAudioContext (BaseAudioContext).
 */

import { scoreToEchoOctave } from '../mascots/echo.js';

export const DEFAULT_MASTER_GAIN = 0.28;
export const DEFAULT_TICK_THROTTLE_MS = 80;
export const MAX_CONCURRENT_VOICES = 8;

const masterDestinations = new WeakMap();

/**
 * Returns or creates a shared master gain + DynamicsCompressorNode chain for a BaseAudioContext.
 * @param {BaseAudioContext} ctx
 */
export function getMasterDestination(ctx) {
  if (!ctx) {
    return null;
  }
  const existing = masterDestinations.get(ctx);
  if (existing) {
    return existing;
  }

  const masterGain = ctx.createGain();
  masterGain.gain.value = DEFAULT_MASTER_GAIN;

  if (typeof ctx.createDynamicsCompressor === 'function') {
    const compressor = ctx.createDynamicsCompressor();
    if (compressor.threshold) compressor.threshold.value = -16;
    if (compressor.knee) compressor.knee.value = 18;
    if (compressor.ratio) compressor.ratio.value = 6;
    if (compressor.attack) compressor.attack.value = 0.003;
    if (compressor.release) compressor.release.value = 0.15;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }

  masterDestinations.set(ctx, masterGain);
  return masterGain;
}

/**
 * Maps a score (0..10) to ECHO's base tone frequency across octaves.
 * @param {number} score
 * @returns {number}
 */
export function echoScoreToFrequency(score) {
  const octave = scoreToEchoOctave(score);
  // C3 (~130.81 Hz) stepped across octaves 0..3
  return Number((130.81 * 2 ** octave).toFixed(2));
}

function scheduleRampGain(gainParam, startTime, peak, attackSec, releaseSec) {
  const safeStart = Math.max(0, Number.isFinite(startTime) ? startTime : 0);
  gainParam.setValueAtTime(0.0001, safeStart);
  gainParam.linearRampToValueAtTime(peak, safeStart + attackSec);
  gainParam.exponentialRampToValueAtTime(0.0001, safeStart + attackSec + releaseSec);
  return safeStart + attackSec + releaseSec;
}

function createDeterministicNoiseBuffer(ctx, durationSec) {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x12345678;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  return buffer;
}

/**
 * KOMA voice: short filtered paper/panel snap (no external audio files).
 */
export function playPaperSnap(ctx, dest, startTime = ctx.currentTime) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  const t = Math.max(0, startTime ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = createDeterministicNoiseBuffer(ctx, 0.08);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1450, t);
  filter.Q.setValueAtTime(1.8, t);

  const gain = ctx.createGain();
  const stopAt = scheduleRampGain(gain.gain, t, 0.55, 0.004, 0.065);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(target);

  src.start(t);
  src.stop(stopAt + 0.01);
}

/**
 * SAVE voice: ascending crystal arpeggio triad.
 */
export function playCrystalChord(ctx, dest, startTime = ctx.currentTime) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  const baseTime = Math.max(0, startTime ?? 0);
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((freq, idx) => {
    const t = baseTime + idx * 0.048;
    const osc = ctx.createOscillator();
    osc.type = idx === 2 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);

    const gain = ctx.createGain();
    const stopAt = scheduleRampGain(gain.gain, t, 0.24, 0.008, 0.22);

    osc.connect(gain);
    gain.connect(target);
    osc.start(t);
    osc.stop(stopAt + 0.01);
  });
}

/**
 * KINO voice: dry mechanical 35mm shutter double-click.
 */
export function playShutterClick(ctx, dest, startTime = ctx.currentTime) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  const baseTime = Math.max(0, startTime ?? 0);
  [0, 0.024].forEach((offset, idx) => {
    const t = baseTime + offset;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(idx === 0 ? 1850 : 1220, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.025);

    const gain = ctx.createGain();
    const stopAt = scheduleRampGain(gain.gain, t, 0.36, 0.002, 0.028);

    osc.connect(gain);
    gain.connect(target);
    osc.start(t);
    osc.stop(stopAt + 0.01);
  });
}

/**
 * ECHO voice: harmonic tone whose octave scales with the note score (0..10).
 */
export function playEchoTone(ctx, dest, startTime = ctx.currentTime, params = {}) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  const t = Math.max(0, startTime ?? 0);
  const freq = echoScoreToFrequency(params.score ?? 5);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  const gain = ctx.createGain();
  const stopAt = scheduleRampGain(gain.gain, t, 0.3, 0.012, 0.22);

  osc.connect(gain);
  gain.connect(target);
  osc.start(t);
  osc.stop(stopAt + 0.01);
}

/**
 * Soft throttled slider tick voice.
 */
export function playSliderTick(ctx, dest, startTime = ctx.currentTime, params = {}) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  const t = Math.max(0, startTime ?? 0);
  const score = Number.isFinite(params.score) ? params.score : 5;
  const freq = 360 + score * 48;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  const gain = ctx.createGain();
  const stopAt = scheduleRampGain(gain.gain, t, 0.14, 0.003, 0.032);

  osc.connect(gain);
  gain.connect(target);
  osc.start(t);
  osc.stop(stopAt + 0.01);
}

/**
 * Dispatches a voice by canonical name onto any BaseAudioContext.
 */
export function playVoice(voiceName, ctx, startTime, params = {}, dest = null) {
  const target = dest || getMasterDestination(ctx);
  if (!ctx || !target) {
    return;
  }
  if (voiceName === 'koma' || voiceName === 'paperSnap') {
    playPaperSnap(ctx, target, startTime);
  } else if (voiceName === 'save' || voiceName === 'crystalChord') {
    playCrystalChord(ctx, target, startTime);
  } else if (voiceName === 'kino' || voiceName === 'shutterClick') {
    playShutterClick(ctx, target, startTime);
  } else if (voiceName === 'echo' || voiceName === 'echoTone') {
    playEchoTone(ctx, target, startTime, params);
  } else if (voiceName === 'tick' || voiceName === 'sliderTick') {
    playSliderTick(ctx, target, startTime, params);
  }
}

/**
 * Creates a throttler + concurrent voice limiter for live interactive sound triggers.
 * @param {{ intervalMs?: number, maxVoices?: number, now?: () => number }} [options]
 */
export function createTickThrottler(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_TICK_THROTTLE_MS;
  const maxVoices = options.maxVoices ?? MAX_CONCURRENT_VOICES;
  const now = options.now || (() => performance.now());

  let lastTriggerAt = -Infinity;
  /** @type {number[]} */
  let activeEndTimes = [];

  function canTriggerTick(timestampMs = now()) {
    if (timestampMs - lastTriggerAt < intervalMs) {
      return false;
    }
    activeEndTimes = activeEndTimes.filter((endMs) => endMs > timestampMs);
    if (activeEndTimes.length >= maxVoices) {
      return false;
    }
    lastTriggerAt = timestampMs;
    activeEndTimes.push(timestampMs + 60);
    return true;
  }

  function reserveVoiceSlot(durationMs = 260, timestampMs = now()) {
    activeEndTimes = activeEndTimes.filter((endMs) => endMs > timestampMs);
    if (activeEndTimes.length >= maxVoices) {
      return false;
    }
    activeEndTimes.push(timestampMs + durationMs);
    return true;
  }

  return {
    canTriggerTick,
    reserveVoiceSlot
  };
}

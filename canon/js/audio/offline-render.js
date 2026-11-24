/**
 * Deterministic offline audio renderer using OfflineAudioContext and the exact voices from synth.js.
 */

import { getMasterDestination, playVoice } from './synth.js';

export const DEFAULT_SAMPLE_RATE = 44100;
export const DEFAULT_CHANNELS = 2;

function defaultCreateOfflineContext({ channels, length, sampleRate }) {
  const Ctor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof Ctor !== 'function') {
    throw new Error('OfflineAudioContext indisponível neste navegador.');
  }
  return new Ctor(channels, length, sampleRate);
}

/**
 * Renders an audio timeline `[{ t, voice, params }]` into an AudioBuffer via OfflineAudioContext.
 * @param {Array<{ t: number, voice: string, params?: Record<string, any> }>} timeline
 * @param {number} durationSec
 * @param {{
 *   sampleRate?: number,
 *   channels?: number,
 *   createOfflineContext?: (cfg: { channels: number, length: number, sampleRate: number }) => OfflineAudioContext
 * }} [options]
 * @returns {Promise<AudioBuffer>}
 */
export async function renderTimelineAudio(timeline = [], durationSec = 7, options = {}) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new RangeError('durationSec deve ser um número positivo.');
  }

  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? DEFAULT_CHANNELS;
  const length = Math.max(1, Math.ceil(durationSec * sampleRate));
  const createCtx = options.createOfflineContext || defaultCreateOfflineContext;

  const offlineCtx = createCtx({ channels, length, sampleRate });
  const masterDest = getMasterDestination(offlineCtx);

  const sorted = Array.isArray(timeline)
    ? [...timeline].sort((a, b) => (a?.t ?? 0) - (b?.t ?? 0))
    : [];

  for (const event of sorted) {
    const voiceName = typeof event?.voz === 'string' ? event.voz : event?.voice;
    if (!event || typeof voiceName !== 'string') {
      continue;
    }
    const time = Number(event.t);
    if (!Number.isFinite(time) || time < 0 || time >= durationSec) {
      continue;
    }
    playVoice(voiceName, offlineCtx, time, event.params || {}, masterDest);
  }

  return offlineCtx.startRendering();
}

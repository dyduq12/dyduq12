/**
 * Deterministic 1080x1920 MP4 video export orchestration powered by on-demand Mediabunny,
 * OfflineAudioContext synthesis, MessageChannel thread yielding, progressive fallback (60->30fps, no-audio),
 * and full AbortSignal cleanup with zero leaked resources.
 */

import { renderTimelineAudio } from '../audio/offline-render.js';
import { computeVideoLayout, VIDEO_HEIGHT, VIDEO_WIDTH } from './layout.js';
import { normalizePosterTheme } from './poster.js';
import { VIDEO_DURATION_SEC, buildTimeline } from './timeline.js';
import {
  advanceMascotWorldForFrame,
  createVideoMascotWorld,
  decodeLocalCoverBitmap,
  drawFrame,
  resolveSafeCoverBlob
} from './video-frame.js';

export const DEFAULT_VIDEO_FPS = 60;
export const FALLBACK_VIDEO_FPS = 30;
export const DEFAULT_AUDIO_SAMPLE_RATES = Object.freeze([48000, 44100]);
export const DEFAULT_YIELD_EVERY_FRAMES = 4;

const MEDIABUNNY_VENDOR_PATH = '../../vendor/mediabunny/mediabunny.min.mjs';

/**
 * Typed error class for MP4 video export failures and user cancellations.
 */
export class VideoExportError extends Error {
  /**
   * @param {'VID_UNSUPPORTED' | 'EXPORT_CANCELLED' | 'MEDIABUNNY_LOAD_ERROR' | 'INVALID_WORK' | 'CANVAS_UNAVAILABLE' | 'AUDIO_RENDER_ERROR' | 'ENCODER_ERROR'} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'VideoExportError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Yields to the browser event loop using `MessageChannel` (avoids timer throttling in background tabs).
 */
export function createMessageChannelYield() {
  if (typeof globalThis.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new globalThis.MessageChannel();
      channel.port2.onmessage = () => {
        channel.port1.onmessage = null;
        channel.port2.onmessage = null;
        channel.port1.close?.();
        channel.port2.close?.();
        resolve();
      };
      channel.port1.postMessage(null);
    });
  }
  return Promise.resolve();
}

/**
 * Dynamically imports the vendored Mediabunny ESM bundle on demand (zero CDN).
 */
export async function loadMediabunnyBundle() {
  try {
    return await import(MEDIABUNNY_VENDOR_PATH);
  } catch (err) {
    throw new VideoExportError(
      'MEDIABUNNY_LOAD_ERROR',
      'Não foi possível carregar o módulo local de codificação MP4 (Mediabunny).',
      err
    );
  }
}

function resolveQualityInstance(mb, level = 'high') {
  if (typeof mb.Quality === 'function') {
    return new mb.Quality(level);
  }
  return level === 'medium' ? mb.QUALITY_MEDIUM : mb.QUALITY_HIGH;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new VideoExportError('EXPORT_CANCELLED', 'Exportação de vídeo cancelada pelo usuário.', signal.reason);
  }
}

/**
 * Probes H.264 video (with 60 -> 30 fps fallback) and AAC audio support via Mediabunny `canEncode*`.
 * Never falls back silently to non-AAC audio codecs.
 *
 * @param {{
 *   fps?: number,
 *   withAudio?: boolean,
 *   width?: number,
 *   height?: number,
 *   mediabunny?: any,
 *   loadMediabunny?: () => Promise<any>
 * }} [options]
 */
export async function probeVideoExportSupport(options = {}) {
  const loadFn = options.loadMediabunny || loadMediabunnyBundle;
  const mb = options.mediabunny || (await loadFn());
  const requestedFps = Number(options.fps) === FALLBACK_VIDEO_FPS ? FALLBACK_VIDEO_FPS : DEFAULT_VIDEO_FPS;
  const wantAudio = options.withAudio !== false;
  const width = options.width ?? VIDEO_WIDTH;
  const height = options.height ?? VIDEO_HEIGHT;
  const videoQuality = resolveQualityInstance(mb, 'high');
  const audioQuality = resolveQualityInstance(mb, 'high');
  const warnings = [];

  const checkVideoCodec = async (fps) => {
    if (typeof mb.canEncodeVideo === 'function') {
      return Boolean(await mb.canEncodeVideo('avc', { width, height, frameRate: fps, quality: videoQuality }));
    }
    if (typeof mb.canEncode === 'function') {
      return Boolean(await mb.canEncode('avc'));
    }
    return false;
  };

  let effectiveFps = requestedFps;
  let videoSupported = await checkVideoCodec(requestedFps);

  if (!videoSupported && requestedFps > FALLBACK_VIDEO_FPS) {
    const can30 = await checkVideoCodec(FALLBACK_VIDEO_FPS);
    if (can30) {
      videoSupported = true;
      effectiveFps = FALLBACK_VIDEO_FPS;
      warnings.push(
        `Codificação H.264 em ${width}×${height} a ${requestedFps} fps indisponível; usando ${FALLBACK_VIDEO_FPS} fps.`
      );
    }
  }

  let audioSupported = false;
  let sampleRate = null;

  if (wantAudio && videoSupported) {
    for (const rate of DEFAULT_AUDIO_SAMPLE_RATES) {
      let supported = false;
      if (typeof mb.canEncodeAudio === 'function') {
        supported = Boolean(
          await mb.canEncodeAudio('aac', {
            numberOfChannels: 2,
            sampleRate: rate,
            quality: audioQuality
          })
        );
      } else if (typeof mb.canEncode === 'function') {
        supported = Boolean(await mb.canEncode('aac'));
      }
      if (supported) {
        audioSupported = true;
        sampleRate = rate;
        break;
      }
    }

    if (!audioSupported) {
      warnings.push(
        'Áudio AAC não suportado neste navegador; o vídeo será exportado sem áudio.'
      );
    }
  }

  return {
    mediabunny: mb,
    videoSupported,
    videoCodec: videoSupported ? 'avc' : null,
    fps: effectiveFps,
    audioSupported,
    audioCodec: audioSupported ? 'aac' : null,
    sampleRate,
    warnings
  };
}

async function safeCancelOutput(output) {
  if (!output || typeof output.cancel !== 'function') {
    return;
  }
  try {
    await output.cancel();
  } catch (err) {
    console.warn('[video] Falha secundária ao cancelar output:', { message: err?.message });
  }
}

function createDefaultCanvas(width, height) {
  const canvas = globalThis.document?.createElement?.('canvas');
  if (!canvas) {
    return null;
  }
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Exports a deterministic 1080x1920 ~7 s MP4 video file with mascot animation and synthesized offline audio.
 *
 * Execution order:
 * 1. Load Mediabunny on demand
 * 2. Probe H.264 (60 -> 30 fps fallback) and AAC (or warn & export video-only)
 * 3. Pre-render full offline stereo audio via `OfflineAudioContext`
 * 4. Construct MP4 `Output` (`fastStart: 'in-memory'`, `BufferTarget`) + register tracks before `start()`
 * 5. Add pre-rendered audio + encode exact deterministic frames (`i = 0..fps*duration-1`), yielding periodically
 * 6. `finalize()` and return `{ blob, info }`
 *
 * @param {{
 *   work: Record<string, any>,
 *   theme?: Record<string, any>,
 *   fps?: number,
 *   withAudio?: boolean,
 *   showMascots?: boolean,
 *   durationSec?: number,
 *   yieldEvery?: number,
 *   db?: any,
 *   coverBlob?: Blob | null,
 *   signal?: AbortSignal,
 *   onProgress?: (p: { fase: string, quadro: number, total: number, fracao: number }) => void,
 *   onWarning?: (message: string) => void,
 *   deps?: {
 *     loadMediabunny?: () => Promise<any>,
 *     createCanvas?: (w: number, h: number) => HTMLCanvasElement,
 *     renderAudio?: typeof renderTimelineAudio,
 *     yieldToEventLoop?: () => Promise<void>,
 *     fetchFn?: typeof fetch,
 *     decodeBlob?: (blob: Blob) => Promise<{ source: any, close?: () => void }>,
 *     doc?: Document
 *   }
 * }} options
 */
export async function exportVideo(options = {}) {
  const {
    work,
    theme,
    fps = DEFAULT_VIDEO_FPS,
    withAudio = true,
    showMascots = true,
    durationSec = VIDEO_DURATION_SEC,
    yieldEvery = DEFAULT_YIELD_EVERY_FRAMES,
    db,
    coverBlob,
    signal,
    onProgress,
    onWarning,
    deps = {}
  } = options;

  if (!work || typeof work !== 'object') {
    throw new VideoExportError('INVALID_WORK', 'Nenhuma obra válida informada para exportar o vídeo.');
  }

  throwIfAborted(signal);

  const loadMediabunny = deps.loadMediabunny || loadMediabunnyBundle;
  const createCanvas = deps.createCanvas || createDefaultCanvas;
  const renderAudio = deps.renderAudio || renderTimelineAudio;
  const yieldToEventLoop = deps.yieldToEventLoop || createMessageChannelYield;
  const doc = deps.doc ?? globalThis.document;
  const safeYieldEvery = Math.max(1, Math.trunc(yieldEvery || DEFAULT_YIELD_EVERY_FRAMES));

  const reportProgress = (fase, quadro, total, fracao) => {
    onProgress?.({
      fase,
      quadro,
      total,
      fracao: Math.max(0, Math.min(1, Number(fracao) || 0))
    });
  };

  // Step 1 & 2: Load Mediabunny on demand and verify codec support (R6)
  reportProgress('codecs', 0, 1, 0);
  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const support = await probeVideoExportSupport({
    fps,
    withAudio,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    mediabunny: mb
  });
  throwIfAborted(signal);

  if (!support.videoSupported) {
    throw new VideoExportError(
      'VID_UNSUPPORTED',
      'Exportação de vídeo MP4 (H.264) não suportada neste navegador. Use a aba Pôster PNG.'
    );
  }

  const warnings = [...support.warnings];
  for (const w of warnings) {
    onWarning?.(w);
  }

  const effectiveFps = support.fps;
  const timeline = buildTimeline(work, { durationSec });
  const totalFrames = Math.max(1, Math.round(effectiveFps * timeline.duration));

  // Step 3: Pre-render entire audio buffer offline BEFORE encoding video
  let audioBuffer = null;
  if (withAudio && support.audioSupported && support.sampleRate) {
    reportProgress('audio', 0, totalFrames, 0.04);
    try {
      audioBuffer = await renderAudio(timeline.audioEvents, timeline.duration, {
        sampleRate: support.sampleRate,
        channels: 2
      });
    } catch (err) {
      throwIfAborted(signal);
      throw new VideoExportError(
        'AUDIO_RENDER_ERROR',
        `Falha ao sintetizar áudio offline: ${err?.message || 'erro desconhecido.'}`,
        err
      );
    }
  }

  throwIfAborted(signal);

  // Reusable canvas & cover setup
  const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
  if (!canvas) {
    throw new VideoExportError('CANVAS_UNAVAILABLE', 'Não foi possível criar o canvas de vídeo 1080×1920.');
  }
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;

  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    throw new VideoExportError('CANVAS_UNAVAILABLE', 'Contexto Canvas 2D indisponível neste dispositivo.');
  }

  const normalizedTheme = normalizePosterTheme(theme, work.palette);
  const measure = (text, fontSize, fontSpec) => {
    ctx.font = fontSpec;
    const w = ctx.measureText?.(text)?.width;
    return Number.isFinite(w) ? w : String(text || '').length * fontSize * 0.56;
  };
  const layout = computeVideoLayout(work, {
    measure,
    fonts: normalizedTheme.fonts,
    showMascots
  });
  const finalTheme = normalizePosterTheme(theme, layout.model.palette);

  const coverLookup = await resolveSafeCoverBlob(work, {
    db,
    coverBlob,
    fetchFn: deps.fetchFn
  });
  const decodedCover = await decodeLocalCoverBitmap(coverLookup.blob, {
    decodeBlob: deps.decodeBlob
  });

  if (coverLookup.warning || decodedCover.warning) {
    const coverWarning = coverLookup.warning || decodedCover.warning;
    warnings.push(coverWarning);
    onWarning?.(coverWarning);
  }

  let output = null;
  let videoSource = null;
  let audioSource = null;
  let hiddenWarned = false;

  const checkHiddenTab = () => {
    if (!hiddenWarned && doc?.hidden) {
      hiddenWarned = true;
      const msg = 'Aba em segundo plano detectada: mantenha esta aba aberta para evitar pausa na codificação.';
      warnings.push(msg);
      onWarning?.(msg);
    }
  };

  try {
    throwIfAborted(signal);

    // Step 4: Configure Output + fastStart + tracks BEFORE output.start()
    const videoQuality = resolveQualityInstance(mb, 'high');
    const audioQuality = resolveQualityInstance(mb, 'high');

    output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget()
    });

    videoSource = new mb.CanvasSource(canvas, {
      codec: 'avc',
      quality: videoQuality,
      keyFrameInterval: 2
    });
    output.addVideoTrack(videoSource, { frameRate: effectiveFps });

    if (audioBuffer && support.audioSupported) {
      audioSource = new mb.AudioBufferSource({
        codec: 'aac',
        quality: audioQuality
      });
      output.addAudioTrack(audioSource);
    }

    throwIfAborted(signal);
    await output.start();
    throwIfAborted(signal);

    // Step 5a: Feed pre-rendered AudioBuffer first
    if (audioSource && audioBuffer) {
      await audioSource.add(audioBuffer);
      audioSource.close?.();
      audioSource = null;
    }

    const mascotWorld = showMascots ? createVideoMascotWorld(work, layout.model.palette) : null;
    const frameDuration = 1 / effectiveFps;

    // Step 5b & 6: Deterministic frame-by-frame loop with periodic MessageChannel yield
    for (let i = 0; i < totalFrames; i += 1) {
      throwIfAborted(signal);
      checkHiddenTab();

      const t = i / effectiveFps;
      const state = timeline.stateAt(t);

      if (mascotWorld) {
        advanceMascotWorldForFrame(mascotWorld, state.mascotInputs, effectiveFps, i);
      }

      drawFrame(
        ctx,
        {
          coverImage: decodedCover.source,
          mascotWorld
        },
        layout,
        finalTheme,
        state
      );

      await videoSource.add(t, frameDuration);
      throwIfAborted(signal);

      const frameFrac = 0.08 + ((i + 1) / totalFrames) * 0.87;
      reportProgress('video', i + 1, totalFrames, frameFrac);

      if ((i + 1) % safeYieldEvery === 0 && i + 1 < totalFrames) {
        await yieldToEventLoop();
        throwIfAborted(signal);
      }
    }

    videoSource.close?.();
    videoSource = null;

    // Step 7: Finalize MP4 container & emit Blob
    throwIfAborted(signal);
    reportProgress('finalizando', totalFrames, totalFrames, 0.97);
    await output.finalize();
    throwIfAborted(signal);

    const buffer = output.target?.buffer;
    if (!buffer || buffer.byteLength <= 0) {
      throw new VideoExportError('ENCODER_ERROR', 'O codificador retornou um arquivo MP4 vazio.');
    }

    const blob = new Blob([buffer], { type: 'video/mp4' });
    reportProgress('concluido', totalFrames, totalFrames, 1);

    return {
      blob,
      info: {
        fps: effectiveFps,
        duration: timeline.duration,
        frameCount: totalFrames,
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        withAudio: Boolean(audioBuffer && support.audioSupported),
        codecs: {
          video: 'avc',
          audio: audioBuffer && support.audioSupported ? 'aac' : null
        },
        sampleRate: audioBuffer && support.audioSupported ? support.sampleRate : null,
        warnings,
        bytes: blob.size
      }
    };
  } catch (err) {
    const isCancelled =
      signal?.aborted ||
      (err instanceof VideoExportError && err.code === 'EXPORT_CANCELLED') ||
      err?.name === 'AbortError';

    await safeCancelOutput(output);

    if (isCancelled) {
      throw err instanceof VideoExportError && err.code === 'EXPORT_CANCELLED'
        ? err
        : new VideoExportError('EXPORT_CANCELLED', 'Exportação de vídeo cancelada pelo usuário.', err);
    }

    if (err instanceof VideoExportError) {
      throw err;
    }

    throw new VideoExportError(
      'ENCODER_ERROR',
      `Erro ao codificar vídeo MP4: ${err?.message || 'falha inesperada no encoder.'}`,
      err
    );
  } finally {
    decodedCover.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

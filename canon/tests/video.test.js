import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFile, buildVideoFilename } from '../js/export/share.js';
import { VideoExportError, exportVideo, loadMediabunnyBundle } from '../js/export/video.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeWork(geral = 9.3) {
  return {
    id: 'tmdb:100',
    type: 'movie',
    title: 'Akira',
    year: 1988,
    genre: 'Cyberpunk / Animação',
    studio: 'Tokyo Movie Shinsha',
    director: 'Katsuhiro Otomo',
    soundtrack: 'Geinoh Yamashirogumi',
    starring: 'Mitsuo Iwata',
    palette: ['#264653', '#E76F51'],
    scores: {
      geral,
      historia: 9.0,
      gameplay_ritmo: 9.0,
      graficos_fotografia: 10.0,
      trilha: 9.5,
      direcao_arte: 10.0
    },
    pros: ['Animação monumental'],
    cons: ['Final enigmático'],
    status: 'completed',
    verdict: 'Marco absoluto da animação cyberpunk.'
  };
}

function makeFakeCanvasFactory() {
  const createdCanvases = [];
  const createCanvas = (w, h) => {
    const canvas = {
      width: w,
      height: h,
      getContext(type) {
        assert.equal(type, '2d');
        return {
          fillStyle: '',
          strokeStyle: '',
          font: '',
          lineWidth: 1,
          globalAlpha: 1,
          textAlign: 'left',
          textBaseline: 'top',
          save() {},
          restore() {},
          clearRect() {},
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          closePath() {},
          moveTo() {},
          lineTo() {},
          quadraticCurveTo() {},
          bezierCurveTo() {},
          arc() {},
          ellipse() {},
          rect() {},
          clip() {},
          fill() {},
          stroke() {},
          translate() {},
          rotate() {},
          scale() {},
          fillText() {},
          drawImage() {},
          measureText(t) {
            return { width: String(t || '').length * 10 };
          },
          createLinearGradient() {
            return { addColorStop() {} };
          },
          getImageData() {
            throw new Error('getImageData não deve ser chamado por frame no export de vídeo!');
          }
        };
      }
    };
    createdCanvases.push(canvas);
    return canvas;
  };
  return { createCanvas, createdCanvases };
}

function createFakeMediabunnyHarness({
  supportVideo60 = true,
  supportVideo30 = true,
  supportAudioAac = true,
  abortAtFrame = null,
  abortController = null
} = {}) {
  const calls = [];
  const addedVideoFrames = [];
  const addedAudioBuffers = [];
  let outputCanceled = false;
  let outputFinalized = false;
  let sourcesClosed = [];

  class FakeQuality {
    constructor(level) {
      this.level = level;
    }
  }

  class FakeBufferTarget {
    constructor() {
      this.buffer = null;
    }
  }

  class FakeMp4OutputFormat {
    constructor(opts) {
      this.options = opts;
      calls.push(['format', opts]);
    }
  }

  class FakeCanvasSource {
    constructor(_canvas, config) {
      this.config = config;
      calls.push(['createVideoSource', config.codec]);
    }
    async add(timestamp, duration) {
      const index = addedVideoFrames.length;
      addedVideoFrames.push({ timestamp, duration });
      if (abortAtFrame !== null && index === abortAtFrame && abortController) {
        abortController.abort();
      }
    }
    close() {
      sourcesClosed.push('video');
      calls.push(['closeVideoSource']);
    }
  }

  class FakeAudioBufferSource {
    constructor(config) {
      this.config = config;
      calls.push(['createAudioSource', config.codec]);
    }
    async add(audioBuffer) {
      addedAudioBuffers.push(audioBuffer);
      calls.push(['addAudioBuffer', audioBuffer.duration]);
    }
    close() {
      sourcesClosed.push('audio');
      calls.push(['closeAudioSource']);
    }
  }

  class FakeOutput {
    constructor({ format, target }) {
      this.format = format;
      this.target = target;
      this.tracks = [];
      calls.push(['createOutput', format.options?.fastStart]);
    }
    addVideoTrack(source, metadata) {
      this.tracks.push({ kind: 'video', source, metadata });
      calls.push(['addVideoTrack', metadata.frameRate]);
    }
    addAudioTrack(source) {
      this.tracks.push({ kind: 'audio', source });
      calls.push(['addAudioTrack']);
    }
    async start() {
      calls.push(['output.start']);
    }
    async finalize() {
      outputFinalized = true;
      calls.push(['output.finalize']);
      this.target.buffer = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]).buffer;
    }
    async cancel() {
      outputCanceled = true;
      calls.push(['output.cancel']);
    }
  }

  const moduleObj = {
    Output: FakeOutput,
    Mp4OutputFormat: FakeMp4OutputFormat,
    BufferTarget: FakeBufferTarget,
    CanvasSource: FakeCanvasSource,
    AudioBufferSource: FakeAudioBufferSource,
    Quality: FakeQuality,
    canEncodeVideo: async (codec, opts) => {
      calls.push(['canEncodeVideo', codec, opts.width, opts.height, opts.frameRate]);
      if (codec !== 'avc') {
        return false;
      }
      if (opts.frameRate === 60) {
        return supportVideo60;
      }
      if (opts.frameRate === 30) {
        return supportVideo30;
      }
      return false;
    },
    canEncodeAudio: async (codec, opts) => {
      calls.push(['canEncodeAudio', codec, opts.numberOfChannels, opts.sampleRate]);
      if (codec !== 'aac') {
        return false;
      }
      return supportAudioAac;
    }
  };

  return {
    moduleObj,
    calls,
    addedVideoFrames,
    addedAudioBuffers,
    get outputCanceled() {
      return outputCanceled;
    },
    get outputFinalized() {
      return outputFinalized;
    },
    sourcesClosed
  };
}

describe('video.js — Mediabunny, ordem de chamadas, degradações e cancelamento', () => {
  it('carrega Mediabunny vendorizado via import relativo sem CDN', async () => {
    const src = await readFile(path.join(ROOT_DIR, 'js/export/video.js'), 'utf8');
    assert.equal(src.includes('https://'), false);
    assert.equal(src.includes('http://'), false);
    assert.equal(src.includes('vendor/mediabunny/mediabunny.min.mjs'), true);
    assert.equal(src.includes('MessageChannel'), true);

    const mb = await loadMediabunnyBundle();
    assert.equal(typeof mb.Output, 'function');
    assert.equal(typeof mb.Mp4OutputFormat, 'function');
    assert.equal(typeof mb.CanvasSource, 'function');
    assert.equal(typeof mb.AudioBufferSource, 'function');
    assert.equal(typeof mb.canEncodeVideo, 'function');
    assert.equal(typeof mb.canEncodeAudio, 'function');
  });

  it('segue ordem exata, gera 420 quadros (60 fps) e timestamps estritos, com progress monotônico e yields', async () => {
    const harness = createFakeMediabunnyHarness();
    const { createCanvas, createdCanvases } = makeFakeCanvasFactory();
    const progressEvents = [];
    let yieldCount = 0;

    const result = await exportVideo({
      work: makeWork(),
      fps: 60,
      withAudio: true,
      onProgress: (p) => progressEvents.push(p),
      deps: {
        loadMediabunny: async () => harness.moduleObj,
        createCanvas,
        renderAudio: async (events, dur, cfg) => {
          harness.calls.push(['renderAudio', events.length, dur, cfg.sampleRate]);
          return { duration: dur, sampleRate: cfg.sampleRate, numberOfChannels: cfg.channels };
        },
        yieldToEventLoop: async () => {
          yieldCount += 1;
        }
      }
    });

    assert.equal(result.blob.type, 'video/mp4');
    assert.equal(result.info.fps, 60);
    assert.equal(result.info.frameCount, 420);
    assert.equal(result.info.withAudio, true);
    assert.equal(result.info.codecs.video, 'avc');
    assert.equal(result.info.codecs.audio, 'aac');
    assert.equal(harness.addedVideoFrames.length, 420);
    assert.equal(createdCanvases.length, 1, 'Deve reutilizar apenas UM canvas 1080x1920');

    // Ordem obrigatória: codec -> audio -> tracks antes de start -> addAudio -> finalize
    const ops = harness.calls.map((c) => c[0]);
    const idxCanVideo = ops.indexOf('canEncodeVideo');
    const idxCanAudio = ops.indexOf('canEncodeAudio');
    const idxRenderAudio = ops.indexOf('renderAudio');
    const idxTrackV = ops.indexOf('addVideoTrack');
    const idxTrackA = ops.indexOf('addAudioTrack');
    const idxStart = ops.indexOf('output.start');
    const idxAddAudio = ops.indexOf('addAudioBuffer');
    const idxFinalize = ops.indexOf('output.finalize');

    assert.ok(idxCanVideo >= 0 && idxCanVideo < idxRenderAudio);
    assert.ok(idxCanAudio >= 0 && idxCanAudio < idxRenderAudio);
    assert.ok(idxRenderAudio < idxTrackV);
    assert.ok(idxTrackV < idxStart && idxTrackA < idxStart);
    assert.ok(idxStart < idxAddAudio);
    assert.ok(idxAddAudio < idxFinalize);

    // Timestamps i/fps crescentes e último < duração (7s)
    for (let i = 0; i < 420; i += 1) {
      assert.equal(harness.addedVideoFrames[i].timestamp, i / 60);
      assert.equal(harness.addedVideoFrames[i].duration, 1 / 60);
      if (i > 0) {
        assert.ok(harness.addedVideoFrames[i].timestamp > harness.addedVideoFrames[i - 1].timestamp);
      }
    }
    assert.ok(harness.addedVideoFrames[419].timestamp < 7.0);

    // Progresso monotônico terminando em 1 e yields periódicos
    assert.ok(yieldCount >= 50);
    for (let i = 1; i < progressEvents.length; i += 1) {
      assert.ok(progressEvents[i].fracao >= progressEvents[i - 1].fracao);
    }
    assert.equal(progressEvents[progressEvents.length - 1].fracao, 1);

    // Arquivo compartilhável via share.js
    const mp4File = buildFile(result.blob, { title: 'Akira' }, { mimeType: 'video/mp4' });
    assert.equal(mp4File.name, buildVideoFilename('Akira'));
    assert.equal(mp4File.type, 'video/mp4');
  });

  it('faz fallback de 60 para 30 fps (210 quadros) e exporta sem áudio quando AAC não é suportado', async () => {
    const harness = createFakeMediabunnyHarness({
      supportVideo60: false,
      supportVideo30: true,
      supportAudioAac: false
    });
    const { createCanvas } = makeFakeCanvasFactory();
    const warnings = [];
    let audioRendered = false;

    const result = await exportVideo({
      work: makeWork(8.5),
      fps: 60,
      withAudio: true,
      onWarning: (w) => warnings.push(w),
      deps: {
        loadMediabunny: async () => harness.moduleObj,
        createCanvas,
        renderAudio: async () => {
          audioRendered = true;
          return { duration: 7 };
        },
        yieldToEventLoop: async () => {}
      }
    });

    assert.equal(result.info.fps, 30);
    assert.equal(result.info.frameCount, 210);
    assert.equal(harness.addedVideoFrames.length, 210);
    assert.ok(harness.addedVideoFrames[209].timestamp < 7.0);
    assert.equal(result.info.withAudio, false);
    assert.equal(result.info.codecs.audio, null);
    assert.equal(audioRendered, false);
    assert.ok(warnings.some((w) => w.includes('30 fps')));
    assert.ok(warnings.some((w) => w.includes('AAC')));
  });

  it('lança erro tipado VID_UNSUPPORTED quando H.264 não é suportado', async () => {
    const harness = createFakeMediabunnyHarness({
      supportVideo60: false,
      supportVideo30: false,
      supportAudioAac: false
    });
    const { createCanvas } = makeFakeCanvasFactory();

    await assert.rejects(
      () =>
        exportVideo({
          work: makeWork(),
          fps: 60,
          deps: {
            loadMediabunny: async () => harness.moduleObj,
            createCanvas,
            yieldToEventLoop: async () => {}
          }
        }),
      (err) => err instanceof VideoExportError && err.code === 'VID_UNSUPPORTED'
    );
  });

  it('cancela no meio via AbortController, chama output.cancel(), fecha bitmap e libera canvas', async () => {
    const controller = new AbortController();
    const harness = createFakeMediabunnyHarness({
      abortAtFrame: 12,
      abortController: controller
    });
    const { createCanvas, createdCanvases } = makeFakeCanvasFactory();
    let bitmapClosed = false;

    await assert.rejects(
      () =>
        exportVideo({
          work: makeWork(),
          fps: 60,
          coverBlob: new Blob(['webp'], { type: 'image/webp' }),
          signal: controller.signal,
          deps: {
            loadMediabunny: async () => harness.moduleObj,
            createCanvas,
            decodeBlob: async () => ({
              source: { width: 600, height: 900 },
              close: () => {
                bitmapClosed = true;
              }
            }),
            renderAudio: async (_e, d, c) => ({ duration: d, sampleRate: c.sampleRate }),
            yieldToEventLoop: async () => {}
          }
        }),
      (err) => err instanceof VideoExportError && err.code === 'EXPORT_CANCELLED'
    );

    assert.equal(harness.outputCanceled, true);
    assert.equal(harness.outputFinalized, false);
    assert.equal(bitmapClosed, true);
    assert.equal(createdCanvases[0].width, 0);
    assert.equal(createdCanvases[0].height, 0);
  });

  it('emite aviso se document.hidden for detectado durante a renderização', async () => {
    const harness = createFakeMediabunnyHarness();
    const { createCanvas } = makeFakeCanvasFactory();
    const warnings = [];

    await exportVideo({
      work: makeWork(),
      fps: 30,
      withAudio: false,
      onWarning: (w) => warnings.push(w),
      deps: {
        loadMediabunny: async () => harness.moduleObj,
        createCanvas,
        yieldToEventLoop: async () => {},
        doc: { hidden: true }
      }
    });

    assert.ok(warnings.some((w) => w.toLowerCase().includes('aba')));
  });
});

# ADR-0013: Exportação MP4 1080×1920 via Mediabunny `1.66.4` em `vendor/` e timeline única

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 7 implementa a exportação 100% client-side de vídeos verticais MP4 (`1080×1920`, `7,0 s`) combinando a animação determinística dos mascotes e barras de critérios com áudio procedural sintetizado via `OfflineAudioContext`. Conforme a Regra R1, nenhuma biblioteca externa pode ser carregada de CDN em runtime; conforme a Regra R6, todas as assinaturas e opções da API do Mediabunny precisam ser confirmadas na documentação oficial/declarações da versão instalada antes da implementação.

## Pacote e Versão Fixada

- **Pacote npm (`devDependency` exata):** `mediabunny@1.66.4`
- **Licença:** `MPL-2.0` (`node_modules/mediabunny/LICENSE` copiado para `vendor/mediabunny/LICENSE`)
- **Artefato ESM browser sem bundler:** `vendor/mediabunny/mediabunny.min.mjs` (copiado de `node_modules/mediabunny/dist/bundles/mediabunny.min.mjs` via `npm run vendor` / `scripts/vendor-mediabunny.mjs`)
- **Carregamento sob demanda:** `js/export/video.js` importa `../../vendor/mediabunny/mediabunny.min.mjs` via `import()` dinâmico somente quando o usuário acessa a aba **Vídeo MP4** ou solicita o export.

## Assinaturas Confirmadas em `mediabunny@1.66.4` (`dist/mediabunny.d.ts` e `src/encode.ts`)

1. **Contêiner e fast-start (`moov` no início):**
   - `new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })`
   - `fastStart: 'in-memory'` mantém os chunks até `finalize()` para escrever o átomo `moov` antes de `mdat`, garantindo reprodução e compartilhamento imediatos.
2. **Qualidade:**
   - `new Quality('high')` (`QUALITY_HIGH` é marcado como `@deprecated` em favor de `new Quality('high')`). Tanto `VideoEncodingConfig` quanto `AudioEncodingConfig` para codecs comprimidos (`avc`, `aac`) exigem instância de `Quality` (ou `bitrate`).
3. **Verificação prévia de codecs (R6):**
   - `await canEncodeVideo('avc', { width: 1080, height: 1920, frameRate, quality })`
   - `await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate, quality })` (testando `48000` Hz e `44100` Hz)
   - Equivalente genérico disponível: `canEncode(codec)`, além de `getEncodableVideoCodecs`, `getEncodableAudioCodecs` e `getEncodableCodecs`.
4. **Fontes e ciclo de vida do `Output`:**
   - Vídeo: `new CanvasSource(canvas, { codec: 'avc', quality, keyFrameInterval: 2 })` registrado com `output.addVideoTrack(videoSource, { frameRate })` **antes** de `await output.start()`.
   - Áudio: `new AudioBufferSource({ codec: 'aac', quality })` registrado com `output.addAudioTrack(audioSource)` **antes** de `await output.start()`.
   - Escrita: `await audioSource.add(audioBuffer)` e `await videoSource.add(timestampSec, durationSec)` após `await output.start()`; `source.close()` após o último sample de cada trilha.
   - Finalização e cancelamento: `await output.finalize()` popula `output.target.buffer` (`ArrayBuffer`); `await output.cancel()` interrompe a muxagem e libera os encoders WebCodecs internos.

## Coreografia Determinística da Timeline (`js/export/timeline.js`)

Uma única função pura `buildTimeline(work, options)` gera simultaneamente `stateAt(t)` (visual + entradas dos mascotes) e `audioEvents` (`[{ t, voz, params }]`) em `duration = 7,0 s`:

- **0,0 s – 1,0 s (Abertura):** entrada da capa, cabeçalho, título (`titleProgress`) e ficha técnica (`specsProgress`); som de obturador `shutterClick` em `t = 0,08 s`.
- **1,0 s – 5,0 s (Barras e mascotes):** as 5 barras de critérios (`historia`, `gameplay_ritmo`, `graficos_fotografia`, `trilha`, `direcao_arte`) preenchem progressivamente em janelas escalonadas de `0` até a nota real sem ultrapassá-la; dois `sliderTick` sincronizados por barra e entradas contínuas para o mundo de molas.
- **5,0 s – 7,0 s (Veredito e encerramento):** revelação da nota geral e veredito; estalo do KOMA (`paperSnap` em `5,05 s`), tom harmônico do ECHO com oitava conforme média de trilha/direção de arte (`echoTone` em `5,35 s`) e **acorde cristalino (`crystalChord` em `5,75 s`) somente quando `geral >= 9,0` (Hall da Fama)**.

## Decisões Complementares

- **Física consistente entre 60 fps e 30 fps (`js/export/video-frame.js`):** o mundo dos mascotes sempre avança com `FIXED_DT = 1/60`. Em `30 fps`, cada quadro executa 2 subpassos de `1/60`, mantendo física idêntica ao modo `60 fps`.
- **Degradação explícita sem troca silenciosa de codec áudio:** se H.264 falhar a `60 fps`, tenta `30 fps` com aviso; se falhar em ambos, lança `VideoExportError('VID_UNSUPPORTED')` sugerindo o Pôster PNG. Se AAC falhar (ex.: Safari iOS anterior ao 26), exporta **sem áudio** e emite aviso claro, nunca trocando para Opus ou MP3.
- **Responsividade em segundo plano e recursos:** o loop cede a cada 4 quadros usando `MessageChannel` (não afetado pelo throttling de `setTimeout`), alerta se `document.hidden` for detectado, tenta `navigator.wakeLock.request('screen')` progressivamente e libera canvas/bitmaps em `finally` e cancelamento.

## Consequências

- Sincronia estrita entre áudio offline e vídeo sem dependência de CDN ou relógio de parede nos módulos de renderização.
- Testes automatizados em Node validam ordem de chamadas, contagens exatas (`420`/`210`), degradações e cancelamento via módulo Mediabunny falso injetado.

/**
 * "Estúdio" accessible modal panel for:
 * 1) 1080x1350 PNG poster preview, pre-rendering, download, and synchronous Web Share.
 * 2) 1080x1920 MP4 video on-demand export (Mediabunny), progress + ETA (clock kept only here),
 *    AbortController cancellation, progressive Screen Wake Lock, <video> ObjectURL preview, and synchronous MP4 share.
 * Strict DOM construction via createElement/textContent, zero literal colors, zero globals, no markup strings.
 */

import { formatUserError, presentErrorToast } from '../ui/errors.js';
import { renderPoster } from './poster.js';
import { buildFile, canShareFile, downloadFile, shareFile } from './share.js';
import {
  DEFAULT_VIDEO_FPS,
  FALLBACK_VIDEO_FPS,
  exportVideo,
  probeVideoExportSupport
} from './video.js';

const DEFAULT_DEBOUNCE_MS = 140;

/**
 * Resolves colors and concrete font stacks from `css/tokens.css` for either `paper` or `slate`.
 * @param {'paper' | 'slate'} [themeId]
 * @param {Document} [doc]
 */
export function resolvePosterThemeFromDom(themeId = 'paper', doc = globalThis.document) {
  const safeId = themeId === 'slate' ? 'slate' : 'paper';
  if (!doc || !doc.body || typeof globalThis.getComputedStyle !== 'function') {
    return { id: safeId };
  }

  const probe = doc.createElement('span');
  probe.setAttribute('data-theme', safeId);
  probe.hidden = true;
  doc.body.appendChild(probe);

  try {
    const styles = globalThis.getComputedStyle(probe);
    const pick = (name) => styles.getPropertyValue(name).trim();
    const grainAlpha = Number.parseFloat(pick('--grain-opacity'));

    return {
      id: safeId,
      bg: pick('--color-bg'),
      surface: pick('--color-surface'),
      surfaceAlt: pick('--color-surface-alt'),
      text: pick('--color-text'),
      textMuted: pick('--color-text-muted'),
      border: pick('--color-border'),
      borderStrong: pick('--color-border-strong'),
      accent: pick('--color-accent'),
      accentContrast: pick('--color-accent-contrast'),
      grainAlpha: Number.isFinite(grainAlpha) ? grainAlpha : 0.045,
      fonts: {
        condensed: pick('--font-condensed'),
        body: pick('--font-body'),
        mono: pick('--font-mono')
      },
      mascot: {
        ink: pick('--mascot-ink'),
        paper: pick('--mascot-paper'),
        surface: pick('--mascot-surface'),
        accent: pick('--mascot-accent'),
        glow: pick('--mascot-glow'),
        crack: pick('--mascot-crack')
      }
    };
  } finally {
    probe.remove();
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatEtaSuffix(fracao, elapsedMs) {
  if (!Number.isFinite(fracao) || fracao <= 0.1 || fracao >= 0.99 || !Number.isFinite(elapsedMs) || elapsedMs < 400) {
    return '';
  }
  const remainingSec = Math.max(1, Math.round(((elapsedMs / fracao) * (1 - fracao)) / 1000));
  return ` · ~${remainingSec} s restantes`;
}

/**
 * Mounts the accessible "Estúdio" export modal inside `container`.
 * @param {HTMLElement} container
 * @param {{
 *   db: any,
 *   getTheme?: () => 'paper' | 'slate',
 *   toast?: { success: (m: string) => void, warning: (m: string) => void, error: (m: string) => void, info?: (m: string) => void },
 *   renderPosterFn?: typeof renderPoster,
 *   exportVideoFn?: typeof exportVideo,
 *   probeVideoSupportFn?: typeof probeVideoExportSupport,
 *   buildFileFn?: typeof buildFile,
 *   canShareFileFn?: typeof canShareFile,
 *   shareFileFn?: typeof shareFile,
 *   downloadFileFn?: typeof downloadFile,
 *   resolveThemeFn?: typeof resolvePosterThemeFromDom,
 *   now?: () => number,
 *   navigatorObj?: Navigator,
 *   debounceMs?: number
 * }} deps
 */
export function mountPosterStudio(container, deps) {
  if (!container) {
    return null;
  }

  const renderPosterFn = deps.renderPosterFn || renderPoster;
  const exportVideoFn = deps.exportVideoFn || exportVideo;
  const probeVideoSupportFn = deps.probeVideoSupportFn || probeVideoExportSupport;
  const buildFileFn = deps.buildFileFn || buildFile;
  const canShareFileFn = deps.canShareFileFn || canShareFile;
  const shareFileFn = deps.shareFileFn || shareFile;
  const downloadFileFn = deps.downloadFileFn || downloadFile;
  const resolveThemeFn = deps.resolveThemeFn || resolvePosterThemeFromDom;
  const clockNow = deps.now || (() => globalThis.performance?.now?.() ?? 0);
  const navigatorObj = deps.navigatorObj ?? globalThis.navigator;
  const debounceMs = Number.isFinite(deps.debounceMs) ? deps.debounceMs : DEFAULT_DEBOUNCE_MS;

  let activeWork = null;
  let activeTab = 'poster';
  let posterThemeId = 'paper';
  let showMascots = true;
  let selectedFps = DEFAULT_VIDEO_FPS;
  let wantAudio = true;
  let audioCapable = true;
  let videoCapable = true;
  let probeSeq = 0;

  let isOpen = false;
  let renderSeq = 0;
  let debounceTimer = null;
  let previewUrl = null;
  let readyFile = null;

  let videoPreviewUrl = null;
  let readyVideoFile = null;
  let isVideoExporting = false;
  let videoAbortController = null;

  let returnFocusEl = null;

  container.replaceChildren();

  const backdrop = document.createElement('div');
  backdrop.className = 'canon-studio-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = 'canon-studio-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'canon-studio-title');
  dialog.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'canon-studio-header';

  const titleWrap = document.createElement('div');
  const titleEl = document.createElement('h2');
  titleEl.id = 'canon-studio-title';
  titleEl.className = 'canon-studio-title';
  titleEl.textContent = 'Estúdio de Exportação';

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'canon-studio-subtitle';
  subtitleEl.textContent = '1080×1350 PNG · 1080×1920 MP4';
  titleWrap.append(titleEl, subtitleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Fechar';
  closeBtn.setAttribute('aria-label', 'Fechar estúdio de exportação');

  header.append(titleWrap, closeBtn);

  // Mode tabs: Pôster PNG | Vídeo MP4
  const tabList = document.createElement('div');
  tabList.className = 'canon-studio-tabs';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Formato de exportação');

  const posterTabBtn = document.createElement('button');
  posterTabBtn.type = 'button';
  posterTabBtn.id = 'canon-tab-poster';
  posterTabBtn.className = 'canon-studio-tab-btn';
  posterTabBtn.setAttribute('role', 'tab');
  posterTabBtn.setAttribute('aria-selected', 'true');
  posterTabBtn.setAttribute('aria-controls', 'canon-panel-poster');
  posterTabBtn.textContent = 'Pôster PNG';

  const videoTabBtn = document.createElement('button');
  videoTabBtn.type = 'button';
  videoTabBtn.id = 'canon-tab-video';
  videoTabBtn.className = 'canon-studio-tab-btn';
  videoTabBtn.setAttribute('role', 'tab');
  videoTabBtn.setAttribute('aria-selected', 'false');
  videoTabBtn.setAttribute('aria-controls', 'canon-panel-video');
  videoTabBtn.textContent = 'Vídeo MP4';

  tabList.append(posterTabBtn, videoTabBtn);

  const body = document.createElement('div');
  body.className = 'canon-studio-body';

  // Preview stage (holds PNG <img> or MP4 <video> depending on active tab)
  const previewStage = document.createElement('div');
  previewStage.className = 'canon-studio-preview-stage';

  const previewImg = document.createElement('img');
  previewImg.className = 'canon-studio-preview-img';
  previewImg.alt = 'Prévia do pôster PNG 1080 por 1350';
  previewImg.hidden = true;

  const previewVideo = document.createElement('video');
  previewVideo.className = 'canon-studio-preview-video';
  previewVideo.controls = true;
  previewVideo.playsInline = true;
  previewVideo.muted = true;
  previewVideo.hidden = true;
  previewVideo.setAttribute('aria-label', 'Prévia do vídeo MP4 1080 por 1920');

  const previewStatus = document.createElement('p');
  previewStatus.className = 'canon-studio-preview-status';
  previewStatus.setAttribute('aria-live', 'polite');
  previewStatus.textContent = 'Selecione uma obra para gerar a prévia.';

  previewStage.append(previewImg, previewVideo, previewStatus);

  // Controls column
  const controls = document.createElement('div');
  controls.className = 'canon-studio-controls';

  // Shared Theme & Composition fieldsets
  const themeFieldset = document.createElement('fieldset');
  themeFieldset.className = 'canon-studio-fieldset';
  const themeLegend = document.createElement('legend');
  themeLegend.textContent = 'Tema editorial';
  const themeGroup = document.createElement('div');
  themeGroup.className = 'canon-studio-theme-group';

  const paperBtn = document.createElement('button');
  paperBtn.type = 'button';
  paperBtn.className = 'canon-studio-theme-btn';
  paperBtn.textContent = 'Papel Fosco';
  paperBtn.setAttribute('aria-pressed', 'true');

  const slateBtn = document.createElement('button');
  slateBtn.type = 'button';
  slateBtn.className = 'canon-studio-theme-btn';
  slateBtn.textContent = 'Ardósia Noturna';
  slateBtn.setAttribute('aria-pressed', 'false');

  themeGroup.append(paperBtn, slateBtn);
  themeFieldset.append(themeLegend, themeGroup);

  const mascotFieldset = document.createElement('fieldset');
  mascotFieldset.className = 'canon-studio-fieldset';
  const mascotLegend = document.createElement('legend');
  mascotLegend.textContent = 'Composição';

  const mascotLabel = document.createElement('label');
  mascotLabel.className = 'canon-studio-checkbox-row';
  const mascotCheckbox = document.createElement('input');
  mascotCheckbox.type = 'checkbox';
  mascotCheckbox.checked = true;
  const mascotText = document.createElement('span');
  mascotText.textContent = 'Mostrar faixa dos 4 mascotes';
  mascotLabel.append(mascotCheckbox, mascotText);
  mascotFieldset.append(mascotLegend, mascotLabel);

  // Poster panel
  const posterPanel = document.createElement('div');
  posterPanel.id = 'canon-panel-poster';
  posterPanel.className = 'canon-studio-panel';
  posterPanel.setAttribute('role', 'tabpanel');
  posterPanel.setAttribute('aria-labelledby', 'canon-tab-poster');

  const actionsBox = document.createElement('div');
  actionsBox.className = 'canon-studio-actions';

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.dataset.variant = 'primary';
  shareBtn.disabled = true;
  shareBtn.textContent = 'Gerando...';

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Baixar PNG';

  const openImgLink = document.createElement('a');
  openImgLink.className = 'canon-studio-open-link';
  openImgLink.textContent = 'Abrir imagem';
  openImgLink.target = '_blank';
  openImgLink.rel = 'noopener noreferrer';
  openImgLink.setAttribute('aria-disabled', 'true');

  const shareHint = document.createElement('p');
  shareHint.className = 'canon-studio-hint';
  shareHint.textContent = 'Em iPhone/Safari, se o download não iniciar, use "Abrir imagem" e toque longo para salvar.';

  actionsBox.append(shareBtn, downloadBtn, openImgLink, shareHint);
  posterPanel.appendChild(actionsBox);

  // Video panel (never auto-renders on open; user clicks "Gerar vídeo")
  const videoPanel = document.createElement('div');
  videoPanel.id = 'canon-panel-video';
  videoPanel.className = 'canon-studio-panel';
  videoPanel.setAttribute('role', 'tabpanel');
  videoPanel.setAttribute('aria-labelledby', 'canon-tab-video');
  videoPanel.hidden = true;

  const videoNotice = document.createElement('p');
  videoNotice.className = 'canon-studio-notice';
  videoNotice.textContent = 'Mantenha esta aba aberta e a tela ligada durante a exportação.';

  const fpsFieldset = document.createElement('fieldset');
  fpsFieldset.className = 'canon-studio-fieldset';
  const fpsLegend = document.createElement('legend');
  fpsLegend.textContent = 'Taxa de quadros';
  const fpsGroup = document.createElement('div');
  fpsGroup.className = 'canon-studio-theme-group';

  const fps60Btn = document.createElement('button');
  fps60Btn.type = 'button';
  fps60Btn.className = 'canon-studio-theme-btn';
  fps60Btn.textContent = '60 fps (padrão)';
  fps60Btn.setAttribute('aria-pressed', 'true');

  const fps30Btn = document.createElement('button');
  fps30Btn.type = 'button';
  fps30Btn.className = 'canon-studio-theme-btn';
  fps30Btn.textContent = '30 fps (mais leve)';
  fps30Btn.setAttribute('aria-pressed', 'false');

  fpsGroup.append(fps60Btn, fps30Btn);
  fpsFieldset.append(fpsLegend, fpsGroup);

  const audioFieldset = document.createElement('fieldset');
  audioFieldset.className = 'canon-studio-fieldset';
  const audioLegend = document.createElement('legend');
  audioLegend.textContent = 'Áudio sintetizado';

  const audioLabel = document.createElement('label');
  audioLabel.className = 'canon-studio-checkbox-row';
  const audioCheckbox = document.createElement('input');
  audioCheckbox.type = 'checkbox';
  audioCheckbox.checked = true;
  const audioText = document.createElement('span');
  audioText.textContent = 'Incluir áudio';
  audioLabel.append(audioCheckbox, audioText);

  const audioSupportNote = document.createElement('p');
  audioSupportNote.className = 'canon-studio-hint';
  audioSupportNote.textContent = 'Trilha procedural offline sincronizada com a animação (~7 s).';

  audioFieldset.append(audioLegend, audioLabel, audioSupportNote);

  const videoProgressWrap = document.createElement('div');
  videoProgressWrap.className = 'canon-studio-progress-box';

  const videoProgressEl = document.createElement('progress');
  videoProgressEl.className = 'canon-studio-progress';
  videoProgressEl.max = 1;
  videoProgressEl.value = 0;
  videoProgressEl.setAttribute('aria-label', 'Progresso da geração do vídeo MP4');
  videoProgressEl.hidden = true;

  const videoPhaseText = document.createElement('p');
  videoPhaseText.className = 'canon-studio-hint';
  videoPhaseText.setAttribute('aria-live', 'polite');
  videoPhaseText.textContent = 'Clique em "Gerar vídeo" para renderizar 1080×1920 (~7 s).';

  videoProgressWrap.append(videoProgressEl, videoPhaseText);

  const videoActionsBox = document.createElement('div');
  videoActionsBox.className = 'canon-studio-actions';

  const generateVideoBtn = document.createElement('button');
  generateVideoBtn.type = 'button';
  generateVideoBtn.dataset.variant = 'primary';
  generateVideoBtn.textContent = 'Gerar vídeo';

  const cancelVideoBtn = document.createElement('button');
  cancelVideoBtn.type = 'button';
  cancelVideoBtn.textContent = 'Cancelar';
  cancelVideoBtn.disabled = true;

  const shareVideoBtn = document.createElement('button');
  shareVideoBtn.type = 'button';
  shareVideoBtn.textContent = 'Compartilhar MP4';
  shareVideoBtn.disabled = true;

  const downloadVideoBtn = document.createElement('button');
  downloadVideoBtn.type = 'button';
  downloadVideoBtn.textContent = 'Baixar MP4';
  downloadVideoBtn.disabled = true;

  videoActionsBox.append(generateVideoBtn, cancelVideoBtn, shareVideoBtn, downloadVideoBtn);
  videoPanel.append(videoNotice, fpsFieldset, audioFieldset, videoProgressWrap, videoActionsBox);

  controls.append(themeFieldset, mascotFieldset, posterPanel, videoPanel);
  body.append(previewStage, controls);
  dialog.append(header, tabList, body);
  backdrop.appendChild(dialog);
  container.appendChild(backdrop);

  function revokePreviewUrl() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    previewImg.removeAttribute('src');
    previewImg.hidden = true;
    openImgLink.removeAttribute('href');
    openImgLink.setAttribute('aria-disabled', 'true');
  }

  function revokeVideoPreviewUrl() {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      videoPreviewUrl = null;
    }
    previewVideo.pause?.();
    previewVideo.removeAttribute('src');
    previewVideo.load?.();
    previewVideo.hidden = true;
  }

  function syncThemeButtons() {
    paperBtn.setAttribute('aria-pressed', String(posterThemeId === 'paper'));
    slateBtn.setAttribute('aria-pressed', String(posterThemeId === 'slate'));
  }

  function syncFpsButtons() {
    fps60Btn.setAttribute('aria-pressed', String(selectedFps === DEFAULT_VIDEO_FPS));
    fps30Btn.setAttribute('aria-pressed', String(selectedFps === FALLBACK_VIDEO_FPS));
  }

  function syncVideoActionButtons() {
    const hasFile = Boolean(readyVideoFile);
    downloadVideoBtn.disabled = isVideoExporting || !hasFile;
    if (isVideoExporting) {
      shareVideoBtn.disabled = true;
      shareVideoBtn.textContent = 'Gerando vídeo...';
    } else if (!hasFile) {
      shareVideoBtn.disabled = true;
      shareVideoBtn.textContent = 'Compartilhar MP4';
    } else if (canShareFileFn(readyVideoFile)) {
      shareVideoBtn.disabled = false;
      shareVideoBtn.textContent = 'Compartilhar MP4';
    } else {
      shareVideoBtn.disabled = true;
      shareVideoBtn.textContent = 'Compartilhar MP4 (indisponível)';
    }
    generateVideoBtn.disabled = isVideoExporting || !videoCapable;
    cancelVideoBtn.disabled = !isVideoExporting;
    fps60Btn.disabled = isVideoExporting;
    fps30Btn.disabled = isVideoExporting;
    audioCheckbox.disabled = isVideoExporting || !audioCapable;
  }

  function syncTabDisplay() {
    const isPoster = activeTab === 'poster';
    posterTabBtn.setAttribute('aria-selected', String(isPoster));
    videoTabBtn.setAttribute('aria-selected', String(!isPoster));
    posterPanel.hidden = !isPoster;
    videoPanel.hidden = isPoster;

    if (isPoster) {
      previewVideo.hidden = true;
      previewImg.hidden = !previewUrl;
      previewStatus.textContent = readyFile
        ? `Pronto (1080×1350 PNG · ${readyFile.name})`
        : 'Gerando prévia 1080×1350...';
    } else {
      previewImg.hidden = true;
      previewVideo.hidden = !videoPreviewUrl;
      if (isVideoExporting) {
        previewStatus.textContent = videoPhaseText.textContent;
      } else if (readyVideoFile) {
        previewStatus.textContent = `Pronto (1080×1920 MP4 · ${readyVideoFile.name})`;
      } else {
        previewStatus.textContent = 'O vídeo MP4 será gerado sob demanda ao clicar em "Gerar vídeo".';
      }
    }
  }

  function setBusyState(message = 'Gerando...') {
    readyFile = null;
    shareBtn.disabled = true;
    shareBtn.textContent = 'Gerando...';
    downloadBtn.disabled = true;
    if (activeTab === 'poster') {
      previewStatus.textContent = message;
    }
  }

  function applyReadyFile(file) {
    readyFile = file;
    downloadBtn.disabled = false;
    const shareSupported = canShareFileFn(file);
    if (shareSupported) {
      shareBtn.disabled = false;
      shareBtn.textContent = 'Compartilhar';
      shareHint.textContent =
        'Compartilhe pelo menu nativo ou baixe o PNG. No iOS, "Abrir imagem" permite salvar por toque longo.';
    } else {
      shareBtn.disabled = true;
      shareBtn.textContent = 'Compartilhar (indisponível)';
      shareHint.textContent =
        'Compartilhamento nativo de arquivo indisponível neste navegador; use "Baixar PNG" ou "Abrir imagem".';
    }
  }

  async function runVideoCodecProbe() {
    const seq = ++probeSeq;
    try {
      const support = await probeVideoSupportFn({
        fps: selectedFps,
        withAudio: true
      });
      if (!isOpen || seq !== probeSeq) {
        return;
      }

      videoCapable = Boolean(support.videoSupported);
      audioCapable = Boolean(support.audioSupported);

      if (!videoCapable) {
        videoPhaseText.textContent =
          'Codificação MP4 (H.264) indisponível neste navegador. Use a aba "Pôster PNG".';
      } else if (!audioCapable) {
        wantAudio = false;
        audioCheckbox.checked = false;
        audioSupportNote.textContent =
          'Áudio AAC não suportado neste navegador; o vídeo será exportado sem áudio.';
      } else {
        audioSupportNote.textContent =
          `Áudio AAC pronto (${support.sampleRate || 44100} Hz estéreo).`;
      }

      if (videoCapable && support.fps !== selectedFps) {
        selectedFps = support.fps;
        syncFpsButtons();
        videoPhaseText.textContent =
          `60 fps indisponível neste dispositivo; ajustado para ${support.fps} fps.`;
      }
      syncVideoActionButtons();
    } catch (err) {
      console.warn('[studio] Probe prévio de codecs indisponível; mantendo padrões:', {
        code: err?.code,
        message: err?.message
      });
    }
  }

  async function runPosterRender(seq) {
    if (!isOpen || !activeWork) {
      return;
    }
    try {
      const resolvedTheme = resolveThemeFn(posterThemeId);
      const result = await renderPosterFn(activeWork, resolvedTheme, {
        db: deps.db,
        showMascots
      });

      if (!isOpen || seq !== renderSeq) {
        return;
      }

      const file = buildFileFn(result.blob, activeWork, { mimeType: 'image/png' });
      const nextUrl = URL.createObjectURL(result.blob);
      revokePreviewUrl();
      previewUrl = nextUrl;

      previewImg.src = nextUrl;
      previewImg.hidden = activeTab !== 'poster';
      openImgLink.href = nextUrl;
      openImgLink.setAttribute('aria-disabled', 'false');

      applyReadyFile(file);
      if (activeTab === 'poster') {
        previewStatus.textContent = `Pronto (1080×1350 PNG · ${file.name})`;
      }

      if (result.warning) {
        deps.toast?.warning?.(result.warning);
      }
    } catch (err) {
      if (!isOpen || seq !== renderSeq) {
        return;
      }
      readyFile = null;
      shareBtn.disabled = true;
      shareBtn.textContent = 'Compartilhar (erro)';
      downloadBtn.disabled = true;
      const formatted = formatUserError(err, { context: 'Pôster PNG' });
      const errMsg = formatted.message || 'Erro ao gerar o pôster PNG.';
      if (activeTab === 'poster') {
        previewStatus.textContent = errMsg;
      }
      presentErrorToast(deps.toast, err, { context: 'Pôster PNG' });
    }
  }

  function scheduleRender(delayMs = debounceMs) {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const seq = ++renderSeq;
    setBusyState('Gerando prévia 1080×1350...');

    if (delayMs <= 0) {
      runPosterRender(seq);
      return;
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runPosterRender(seq);
    }, delayMs);
  }

  async function handleGenerateVideo() {
    if (!isOpen || !activeWork || isVideoExporting) {
      return;
    }

    revokeVideoPreviewUrl();
    readyVideoFile = null;
    isVideoExporting = true;
    videoAbortController = new AbortController();
    videoProgressEl.hidden = false;
    videoProgressEl.value = 0;
    videoPhaseText.textContent = 'Verificando suporte de codecs...';
    syncTabDisplay();
    syncVideoActionButtons();

    const startMs = clockNow();
    let wakeLockSentinel = null;
    try {
      if (typeof navigatorObj?.wakeLock?.request === 'function') {
        wakeLockSentinel = await navigatorObj.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('[studio] Wake Lock indisponível ou recusado pelo sistema:', { message: err?.message });
      wakeLockSentinel = null;
    }

    const phaseLabels = {
      codecs: 'Verificando codecs...',
      audio: 'Sintetizando áudio offline...',
      video: 'Renderizando quadros',
      finalizando: 'Empacotando arquivo MP4...',
      concluido: 'Vídeo pronto.'
    };

    try {
      const resolvedTheme = resolveThemeFn(posterThemeId);
      const { blob, info } = await exportVideoFn({
        work: activeWork,
        theme: resolvedTheme,
        fps: selectedFps,
        withAudio: wantAudio && audioCapable,
        showMascots,
        db: deps.db,
        signal: videoAbortController.signal,
        onWarning: (msg) => {
          deps.toast?.warning?.(msg);
        },
        onProgress: ({ fase, quadro, total, fracao }) => {
          if (!isOpen) {
            return;
          }
          const clampedFrac = Math.max(0, Math.min(1, Number(fracao) || 0));
          videoProgressEl.value = clampedFrac;
          const pct = Math.round(clampedFrac * 100);
          const eta = formatEtaSuffix(clampedFrac, clockNow() - startMs);
          const label = phaseLabels[fase] || fase;
          const detail = fase === 'video'
            ? `${label} (${quadro}/${total} · ${pct}%${eta})`
            : `${label} (${pct}%)`;
          videoPhaseText.textContent = detail;
          if (activeTab === 'video') {
            previewStatus.textContent = detail;
          }
        }
      });

      if (!isOpen) {
        return;
      }

      const file = buildFileFn(blob, activeWork, { mimeType: 'video/mp4' });
      const nextVideoUrl = URL.createObjectURL(blob);
      revokeVideoPreviewUrl();
      videoPreviewUrl = nextVideoUrl;
      readyVideoFile = file;

      previewVideo.src = nextVideoUrl;
      previewVideo.hidden = activeTab !== 'video';

      const audioDesc = info.withAudio ? 'AAC estéreo' : 'sem áudio';
      const summary = `Pronto: ${info.fps} fps · ${audioDesc} · ${formatBytes(info.bytes)}`;
      videoProgressEl.value = 1;
      videoPhaseText.textContent = summary;
      if (activeTab === 'video') {
        previewStatus.textContent = `${summary} (${file.name})`;
      }
      deps.toast?.success?.(`Vídeo MP4 pronto (${formatBytes(info.bytes)}).`);
    } catch (err) {
      if (!isOpen) {
        return;
      }
      if (err?.code === 'EXPORT_CANCELLED') {
        videoProgressEl.hidden = true;
        videoProgressEl.value = 0;
        videoPhaseText.textContent = 'Exportação cancelada. Nenhuma alteração foi mantida.';
        if (activeTab === 'video') {
          previewStatus.textContent = 'Exportação de vídeo cancelada.';
        }
      } else {
        const formatted = formatUserError(err, { context: 'Exportação MP4' });
        const msg = formatted.message || 'Erro ao gerar vídeo MP4.';
        videoPhaseText.textContent = msg;
        if (activeTab === 'video') {
          previewStatus.textContent = msg;
        }
        presentErrorToast(deps.toast, err, { context: 'Exportação MP4' });
      }
    } finally {
      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        try {
          await wakeLockSentinel.release();
        } catch (err) {
          console.warn('[studio] Falha secundária ao liberar Wake Lock:', { message: err?.message });
        }
      }
      isVideoExporting = false;
      videoAbortController = null;
      syncVideoActionButtons();
    }
  }

  function resetVideoState() {
    if (videoAbortController) {
      videoAbortController.abort();
      videoAbortController = null;
    }
    isVideoExporting = false;
    readyVideoFile = null;
    videoCapable = true;
    audioCapable = true;
    wantAudio = true;
    selectedFps = DEFAULT_VIDEO_FPS;
    audioCheckbox.checked = true;
    audioSupportNote.textContent = 'Trilha procedural offline sincronizada com a animação (~7 s).';
    videoProgressEl.hidden = true;
    videoProgressEl.value = 0;
    videoPhaseText.textContent = 'Clique em "Gerar vídeo" para renderizar 1080×1920 (~7 s).';
    revokeVideoPreviewUrl();
    syncFpsButtons();
    syncVideoActionButtons();
  }

  function switchTab(nextTab) {
    if (nextTab !== 'poster' && nextTab !== 'video') {
      return;
    }
    if (activeTab === nextTab) {
      return;
    }
    activeTab = nextTab;
    syncTabDisplay();
    if (nextTab === 'video') {
      runVideoCodecProbe();
    }
  }

  function open(work, triggerEl = null) {
    if (!work || typeof work !== 'object') {
      return;
    }
    returnFocusEl = triggerEl || document.activeElement;
    activeWork = work;
    activeTab = 'poster';
    posterThemeId = deps.getTheme?.() === 'slate' ? 'slate' : 'paper';
    showMascots = true;
    mascotCheckbox.checked = true;
    syncThemeButtons();
    resetVideoState();

    subtitleEl.textContent = `${work.title || 'Obra sem título'} · 1080×1350 PNG · 1080×1920 MP4`;
    isOpen = true;
    backdrop.hidden = false;
    syncTabDisplay();
    closeBtn.focus({ preventScroll: true });
    scheduleRender(0);
  }

  function close() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    renderSeq += 1;
    probeSeq += 1;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    resetVideoState();
    readyFile = null;
    activeWork = null;
    revokePreviewUrl();
    backdrop.hidden = true;

    if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
      returnFocusEl.focus({ preventScroll: true });
    }
    returnFocusEl = null;
  }

  closeBtn.addEventListener('click', close);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  function getFocusableDialogElements() {
    const candidates = Array.from(
      dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')
    );
    return candidates.filter((el) => {
      if (el.disabled || el.hidden || el.getAttribute('aria-disabled') === 'true') {
        return false;
      }
      if (Number.parseInt(el.getAttribute('tabindex') || '0', 10) < 0) {
        return false;
      }
      return !el.closest('[hidden]');
    });
  }

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = getFocusableDialogElements();
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  });

  posterTabBtn.addEventListener('click', () => switchTab('poster'));
  videoTabBtn.addEventListener('click', () => switchTab('video'));
  tabList.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const targetTab = activeTab === 'poster' ? 'video' : 'poster';
      switchTab(targetTab);
      (targetTab === 'poster' ? posterTabBtn : videoTabBtn).focus({ preventScroll: true });
    }
  });

  paperBtn.addEventListener('click', () => {
    if (posterThemeId === 'paper') {
      return;
    }
    posterThemeId = 'paper';
    syncThemeButtons();
    scheduleRender(debounceMs);
  });

  slateBtn.addEventListener('click', () => {
    if (posterThemeId === 'slate') {
      return;
    }
    posterThemeId = 'slate';
    syncThemeButtons();
    scheduleRender(debounceMs);
  });

  mascotCheckbox.addEventListener('change', () => {
    showMascots = mascotCheckbox.checked;
    scheduleRender(debounceMs);
  });

  fps60Btn.addEventListener('click', () => {
    selectedFps = DEFAULT_VIDEO_FPS;
    syncFpsButtons();
  });

  fps30Btn.addEventListener('click', () => {
    selectedFps = FALLBACK_VIDEO_FPS;
    syncFpsButtons();
  });

  audioCheckbox.addEventListener('change', () => {
    wantAudio = audioCheckbox.checked;
  });

  generateVideoBtn.addEventListener('click', () => {
    handleGenerateVideo();
  });

  cancelVideoBtn.addEventListener('click', () => {
    videoAbortController?.abort();
  });

  // CRITICAL: Calls shareFileFn SYNCHRONOUSLY inside click handler without any await before navigator.share.
  shareBtn.addEventListener('click', () => {
    if (!readyFile) {
      return;
    }
    const shareTitle = `${activeWork?.title || 'Obra'} — CANON`;
    const shareText = `Pôster editorial de ${activeWork?.title || 'obra'} no CANON`;
    const sharePromise = shareFileFn(readyFile, {
      title: shareTitle,
      text: shareText,
      fallbackDownload: (f) => downloadFileFn(f)
    });

    sharePromise
      .then((result) => {
        if (!result || result.cancelled) {
          return;
        }
        if (result.ok) {
          deps.toast?.success?.('Pôster compartilhado com sucesso.');
          return;
        }
        if (result.fellBackToDownload) {
          deps.toast?.warning?.(result.error?.message || 'Compartilhamento indisponível; iniciado download do PNG.');
          return;
        }
        if (result.error) {
          deps.toast?.error?.(result.error.message || 'Falha ao compartilhar o pôster.');
        }
      })
      .catch((err) => {
        deps.toast?.error?.(err?.message || 'Falha inesperada ao compartilhar.');
      });
  });

  downloadBtn.addEventListener('click', () => {
    if (!readyFile) {
      return;
    }
    try {
      const res = downloadFileFn(readyFile);
      deps.toast?.success?.(`Download iniciado: ${res.filename}`);
    } catch (err) {
      deps.toast?.error?.(err?.message || 'Erro ao iniciar download do PNG.');
    }
  });

  // CRITICAL: Video share also invokes navigator.share synchronously from the pre-rendered MP4 File.
  shareVideoBtn.addEventListener('click', () => {
    if (!readyVideoFile) {
      return;
    }
    const shareTitle = `${activeWork?.title || 'Obra'} — CANON`;
    const shareText = `Vídeo story editorial de ${activeWork?.title || 'obra'} no CANON`;
    const sharePromise = shareFileFn(readyVideoFile, {
      title: shareTitle,
      text: shareText,
      fallbackDownload: (f) => downloadFileFn(f)
    });

    sharePromise
      .then((result) => {
        if (!result || result.cancelled) {
          return;
        }
        if (result.ok) {
          deps.toast?.success?.('Vídeo MP4 compartilhado com sucesso.');
          return;
        }
        if (result.fellBackToDownload) {
          deps.toast?.warning?.('Compartilhamento nativo indisponível; iniciado download do MP4.');
          return;
        }
        if (result.error) {
          deps.toast?.error?.(result.error.message || 'Falha ao compartilhar o vídeo MP4.');
        }
      })
      .catch((err) => {
        deps.toast?.error?.(err?.message || 'Falha inesperada ao compartilhar vídeo.');
      });
  });

  downloadVideoBtn.addEventListener('click', () => {
    if (!readyVideoFile) {
      return;
    }
    try {
      const res = downloadFileFn(readyVideoFile);
      deps.toast?.success?.(`Download iniciado: ${res.filename}`);
    } catch (err) {
      deps.toast?.error?.(err?.message || 'Erro ao iniciar download do MP4.');
    }
  });

  return {
    open,
    close,
    switchTab,
    isOpen: () => isOpen,
    getReadyFile: () => readyFile,
    getReadyVideoFile: () => readyVideoFile,
    destroy: () => {
      close();
      container.replaceChildren();
    }
  };
}

/**
 * PNG poster File builder, Web Share API wrapper with synchronous user-gesture handling,
 * and ObjectURL download + long-press image fallback.
 * Zero globals, zero literal colors.
 */

export const MAX_SLUG_LENGTH = 48;
export const FALLBACK_SLUG = 'obra';

/**
 * Typed share/download error for predictable UI messaging.
 */
export class ShareError extends Error {
  /**
   * @param {'SHARE_CANCELLED' | 'SHARE_NOT_ALLOWED' | 'SHARE_UNSUPPORTED' | 'SHARE_FAILED' | 'INVALID_FILE'} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Pure slugifier: strips accents, lowercases, replaces non-[a-z0-9] runs with '-',
 * bounds length, and falls back to 'obra' if empty.
 * @param {string} title
 * @param {number} [maxLength]
 * @returns {string}
 */
export function slugifyTitle(title, maxLength = MAX_SLUG_LENGTH) {
  const normalized = String(title ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

  let slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength).replace(/-+$/g, '');
  }

  return slug || FALLBACK_SLUG;
}

/**
 * Builds the canonical PNG filename `canon-<slug>.png`.
 * @param {Record<string, any> | string | null | undefined} workOrTitle
 * @returns {string}
 */
export function buildPosterFilename(workOrTitle) {
  const title = typeof workOrTitle === 'string' ? workOrTitle : workOrTitle?.title;
  return `canon-${slugifyTitle(title)}.png`;
}

/**
 * Builds the canonical MP4 video filename `canon-<slug>.mp4`.
 * @param {Record<string, any> | string | null | undefined} workOrTitle
 * @returns {string}
 */
export function buildVideoFilename(workOrTitle) {
  const title = typeof workOrTitle === 'string' ? workOrTitle : workOrTitle?.title;
  return `canon-${slugifyTitle(title)}.mp4`;
}

/**
 * Wraps an exported Blob (PNG poster or MP4 video) into a named `File`.
 * Defaults to PNG (`image/png`) for backward compatibility; passes `.mp4` when `mimeType === 'video/mp4'`.
 * @param {Blob} blob
 * @param {Record<string, any>} work
 * @param {{ mimeType?: string, filename?: string }} [options]
 * @returns {File}
 */
export function buildFile(blob, work, options = {}) {
  if (!blob || !(blob instanceof Blob)) {
    throw new ShareError('INVALID_FILE', 'Arquivo de exportação inválido ou ainda não gerado.');
  }
  const mimeType =
    typeof options.mimeType === 'string' && options.mimeType
      ? options.mimeType
      : blob.type === 'video/mp4'
        ? 'video/mp4'
        : 'image/png';
  const filename =
    typeof options.filename === 'string' && options.filename
      ? options.filename
      : mimeType === 'video/mp4'
        ? buildVideoFilename(work)
        : buildPosterFilename(work);
  const FileCtor = globalThis.File;
  if (typeof FileCtor === 'function') {
    return new FileCtor([blob], filename, { type: mimeType });
  }
  throw new ShareError('INVALID_FILE', 'Construtor File indisponível neste ambiente.');
}

/**
 * Checks safely whether `navigator.canShare({ files: [file] })` is supported for the given File.
 * @param {File | null | undefined} file
 * @param {Navigator | { canShare?: (data: any) => boolean }} [navigatorObj]
 * @returns {boolean}
 */
export function canShareFile(file, navigatorObj = globalThis.navigator) {
  if (!file || !navigatorObj || typeof navigatorObj.canShare !== 'function') {
    return false;
  }
  try {
    return Boolean(navigatorObj.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/**
 * Triggers a browser file download using a temporary ObjectURL and schedules revocation.
 * @param {File | Blob} file
 * @param {{
 *   filename?: string,
 *   doc?: Document,
 *   urlApi?: { createObjectURL: (obj: Blob) => string, revokeObjectURL: (url: string) => void },
 *   setTimeoutFn?: typeof setTimeout,
 *   revokeDelayMs?: number
 * }} [options]
 */
export function downloadFile(file, options = {}) {
  if (!file || !(file instanceof Blob)) {
    throw new ShareError('INVALID_FILE', 'Arquivo PNG inválido para download.');
  }

  const doc = options.doc || globalThis.document;
  const urlApi = options.urlApi || globalThis.URL;
  const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
  const revokeDelayMs = Number.isFinite(options.revokeDelayMs) ? options.revokeDelayMs : 1500;
  const fallbackName = file.type === 'video/mp4' ? 'canon-obra.mp4' : 'canon-obra.png';
  const filename = options.filename || (typeof file.name === 'string' && file.name ? file.name : fallbackName);

  if (!doc || !urlApi || typeof urlApi.createObjectURL !== 'function' || typeof urlApi.revokeObjectURL !== 'function') {
    throw new ShareError('SHARE_FAILED', 'Download indisponível fora do navegador.');
  }

  const objectUrl = urlApi.createObjectURL(file);
  try {
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener';
    doc.body?.appendChild?.(link);
    link.click();
    link.remove?.();
    return {
      ok: true,
      filename,
      objectUrl
    };
  } finally {
    setTimeoutFn(() => {
      urlApi.revokeObjectURL(objectUrl);
    }, revokeDelayMs);
  }
}

/**
 * Invokes `navigator.share({ files: [file], title, text })` SYNCHRONOUSLY before any `await`
 * so transient user activation (especially on iOS Safari) is preserved.
 * AbortError is treated as user cancellation (not an error); NotAllowedError / TypeError trigger download fallback.
 *
 * @param {File} file
 * @param {{
 *   title?: string,
 *   text?: string,
 *   navigatorObj?: { share?: (data: any) => Promise<void>, canShare?: (data: any) => boolean },
 *   fallbackDownload?: (file: File) => unknown
 * }} [options]
 */
export async function shareFile(file, options = {}) {
  if (!file || !(file instanceof Blob)) {
    return {
      ok: false,
      cancelled: false,
      fellBackToDownload: false,
      error: new ShareError('INVALID_FILE', 'Pôster ainda não está pronto para compartilhamento.')
    };
  }

  const navigatorObj = options.navigatorObj || globalThis.navigator;
  const shareTitle = typeof options.title === 'string' && options.title ? options.title : 'CANON';
  const shareText = typeof options.text === 'string' ? options.text : '';
  const fallbackDownload =
    typeof options.fallbackDownload === 'function' ? options.fallbackDownload : (f) => downloadFile(f);

  if (!navigatorObj || typeof navigatorObj.share !== 'function' || !canShareFile(file, navigatorObj)) {
    try {
      fallbackDownload(file);
      return {
        ok: false,
        cancelled: false,
        fellBackToDownload: true,
        error: new ShareError(
          'SHARE_UNSUPPORTED',
          'Compartilhamento nativo indisponível neste navegador; iniciado download do PNG.'
        )
      };
    } catch (downloadErr) {
      return {
        ok: false,
        cancelled: false,
        fellBackToDownload: false,
        error: new ShareError('SHARE_UNSUPPORTED', downloadErr?.message || 'Não foi possível compartilhar ou baixar.', downloadErr)
      };
    }
  }

  // CRITICAL: Start navigator.share synchronously inside the user gesture turn (zero await before this line).
  let sharePromise;
  try {
    sharePromise = navigatorObj.share({
      files: [file],
      title: shareTitle,
      text: shareText
    });
  } catch (syncErr) {
    return handleShareRejection(syncErr, file, fallbackDownload);
  }

  try {
    await sharePromise;
    return {
      ok: true,
      cancelled: false,
      fellBackToDownload: false,
      error: null
    };
  } catch (err) {
    return handleShareRejection(err, file, fallbackDownload);
  }
}

function handleShareRejection(err, file, fallbackDownload) {
  if (err?.name === 'AbortError') {
    return {
      ok: false,
      cancelled: true,
      fellBackToDownload: false,
      error: null
    };
  }

  const isNotAllowed = err?.name === 'NotAllowedError' || err?.name === 'TypeError';
  const code = isNotAllowed ? 'SHARE_NOT_ALLOWED' : 'SHARE_FAILED';
  const message = isNotAllowed
    ? 'Permissão ou suporte de compartilhamento negado; usando download do PNG.'
    : err?.message || 'Falha ao compartilhar o pôster; usando download do PNG.';

  let fellBackToDownload = false;
  try {
    fallbackDownload(file);
    fellBackToDownload = true;
  } catch {
    fellBackToDownload = false;
  }

  return {
    ok: false,
    cancelled: false,
    fellBackToDownload,
    error: new ShareError(code, message, err)
  };
}

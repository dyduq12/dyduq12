/**
 * Same-origin cover normalization pipeline: fetches external image or reads local File,
 * resizes to ~600x900 on canvas, encodes to WebP (with JPEG/PNG fallback checking blob.type),
 * extracts 2-color palette, and stores the Blob in IndexedDB `covers` store.
 */

import { STORES } from '../core/db.js';
import { DEFAULT_PALETTE } from '../core/schema.js';
import { extractPaletteFromImageSource } from './palette.js';

export const TARGET_COVER_WIDTH = 600;
export const TARGET_COVER_HEIGHT = 900;

const ALLOWED_OUTPUT_MIMES = new Set(['image/webp', 'image/jpeg', 'image/png']);

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao decodificar arquivo de imagem.'));
    };

    img.src = objectUrl;
  });
}

async function decodeImageBlob(blob) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          if (typeof bitmap.close === 'function') {
            bitmap.close();
          }
        }
      };
    } catch (err) {
      console.warn('[cover] createImageBitmap falhou; tentando HTMLImageElement:', { message: err?.message });
    }
  }
  return loadImageFromBlob(blob);
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`canvas.toBlob retornou nulo para ${mimeType}.`));
            return;
          }
          resolve(blob);
        },
        mimeType,
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

async function encodeCanvasWithFallback(canvas) {
  const candidates = [
    { mime: 'image/webp', quality: 0.85 },
    { mime: 'image/jpeg', quality: 0.88 },
    { mime: 'image/png', quality: undefined }
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const blob = await canvasToBlob(canvas, candidate.mime, candidate.quality);
      if (ALLOWED_OUTPUT_MIMES.has(blob.type)) {
        return blob;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Navegador não conseguiu codificar a capa em WebP, JPEG ou PNG.');
}

function drawCoverFit(ctx, source, srcWidth, srcHeight, destWidth, destHeight) {
  const srcRatio = srcWidth / Math.max(1, srcHeight);
  const destRatio = destWidth / destHeight;

  let sx = 0;
  let sy = 0;
  let sw = srcWidth;
  let sh = srcHeight;

  if (srcRatio > destRatio) {
    sw = srcHeight * destRatio;
    sx = (srcWidth - sw) / 2;
  } else if (srcRatio < destRatio) {
    sh = srcWidth / destRatio;
    sy = (srcHeight - sh) / 2;
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destWidth, destHeight);
}

/**
 * Normalizes any local image Blob/File to ~600x900, computes 2-color palette, and saves in `covers`.
 * @param {Blob} inputBlob
 * @param {string} workId
 * @param {{ db: ReturnType<import('../core/db.js').createDatabase> }} deps
 */
export async function normalizeAndStoreCoverBlob(inputBlob, workId, deps) {
  if (!inputBlob || !(inputBlob instanceof Blob)) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Nenhum arquivo de imagem válido fornecido.',
      coverKey: null,
      palette: [...DEFAULT_PALETTE]
    };
  }

  let decoded = null;
  try {
    decoded = await decodeImageBlob(inputBlob);
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_COVER_WIDTH;
    canvas.height = TARGET_COVER_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto 2D indisponível para redimensionar capa.');
    }

    drawCoverFit(ctx, decoded.source, decoded.width, decoded.height, TARGET_COVER_WIDTH, TARGET_COVER_HEIGHT);

    const paletteResult = extractPaletteFromImageSource(decoded.source, 32);
    const encodedBlob = await encodeCanvasWithFallback(canvas);

    const coverKey = `cover:${workId}`;
    await deps.db.put(STORES.COVERS, encodedBlob, coverKey);

    return {
      ok: true,
      code: null,
      message: null,
      coverKey,
      mimeType: encodedBlob.type,
      palette: paletteResult.palette
    };
  } catch (err) {
    console.error('[cover.normalizeAndStoreCoverBlob] Falha ao processar capa:', {
      workId,
      name: err?.name,
      message: err?.message
    });
    return {
      ok: false,
      code: 'COVER_PROCESS_FAILED',
      message: err?.message || 'Não foi possível processar a imagem da capa.',
      coverKey: null,
      palette: [...DEFAULT_PALETTE]
    };
  } finally {
    decoded?.cleanup?.();
  }
}

/**
 * Downloads an external cover URL via fetch (never drawing external URLs directly on canvas),
 * converts it to a local Blob (~600x900), extracts palette, and saves in `covers`.
 * @param {string} coverUrl
 * @param {string} workId
 * @param {{ db: ReturnType<import('../core/db.js').createDatabase>, fetchFn?: typeof fetch, signal?: AbortSignal }} deps
 */
export async function fetchAndStoreCover(coverUrl, workId, deps) {
  const fetchFn = deps.fetchFn || globalThis.fetch;
  if (!coverUrl || typeof fetchFn !== 'function') {
    return {
      ok: false,
      code: 'CORS_OR_NETWORK',
      message: 'URL da capa indisponível. Envie uma imagem manual ou use a capa padrão.',
      coverKey: null,
      palette: [...DEFAULT_PALETTE]
    };
  }

  let fetchedBlob;
  try {
    const response = await fetchFn(coverUrl, { mode: 'cors', signal: deps.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao baixar capa.`);
    }
    fetchedBlob = await response.blob();
  } catch (err) {
    console.warn('[cover.fetchAndStoreCover] Falha CORS/rede ao baixar capa externa:', {
      coverUrl,
      message: err?.message
    });
    return {
      ok: false,
      code: 'CORS_OR_NETWORK',
      message: 'A capa externa bloqueou o download (CORS/rede). Faça upload manual ou salve sem capa.',
      coverKey: null,
      palette: [...DEFAULT_PALETTE]
    };
  }

  return normalizeAndStoreCoverBlob(fetchedBlob, workId, deps);
}

/**
 * Reads a stored cover Blob from IndexedDB and creates a same-origin ObjectURL for preview.
 * Caller is responsible for revoking the returned ObjectURL when no longer needed.
 * @param {ReturnType<import('../core/db.js').createDatabase>} db
 * @param {string | null} coverKey
 * @returns {Promise<string | null>}
 */
export async function createCoverPreviewUrl(db, coverKey) {
  if (!db || !coverKey || !coverKey.startsWith('cover:')) {
    return null;
  }
  try {
    const blob = await db.get(STORES.COVERS, coverKey);
    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  } catch (err) {
    console.warn('[cover.createCoverPreviewUrl] Falha ao ler capa no IndexedDB:', {
      coverKey,
      message: err?.message
    });
    return null;
  }
}

/**
 * Revokes a cover preview ObjectURL created via `createCoverPreviewUrl`.
 * @param {string | null | undefined} objectUrl
 */
export function revokeCoverPreviewUrl(objectUrl) {
  if (typeof objectUrl === 'string' && objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
}

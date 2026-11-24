/**
 * Typed fetch wrapper with AbortController timeout and structured error classification.
 */

export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Typed HTTP/network error raised by fetchJson.
 */
export class HttpError extends Error {
  /**
   * @param {string} kind
   * @param {string} message
   * @param {{ status?: number, retryAfterMs?: number, cause?: unknown, url?: string }} [meta]
   */
  constructor(kind, message, meta = {}) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = meta.status ?? 0;
    this.retryAfterMs = meta.retryAfterMs ?? 0;
    this.url = meta.url ?? '';
    if (meta.cause !== undefined) {
      this.cause = meta.cause;
    }
  }
}

/**
 * Parses a Retry-After header (seconds or HTTP-date) into milliseconds.
 * @param {string | null} headerValue
 * @param {number} [nowMs]
 * @returns {number}
 */
export function parseRetryAfterMs(headerValue, nowMs = Date.now()) {
  if (!headerValue) {
    return 0;
  }
  const trimmed = String(headerValue).trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - nowMs);
  }
  return 0;
}

function classifyHttpStatus(status) {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status >= 500 && status <= 599) {
    return 'server';
  }
  return 'http';
}

function formatStatusMessage(kind, status) {
  if (kind === 'auth') {
    return `Chave de API inválida ou sem permissão (HTTP ${status}).`;
  }
  if (kind === 'not_found') {
    return `Recurso não encontrado na API (HTTP ${status}).`;
  }
  if (kind === 'rate_limit') {
    return `Limite de requisições da API atingido (HTTP ${status}).`;
  }
  if (kind === 'server') {
    return `Serviço externo indisponível no momento (HTTP ${status}).`;
  }
  return `Erro HTTP inesperado (${status}).`;
}

/**
 * Performs a fetch request with timeout and JSON parsing, throwing HttpError on failure.
 * @param {string} url
 * @param {{
 *   method?: string,
 *   headers?: Record<string, string>,
 *   body?: string,
 *   timeoutMs?: number,
 *   signal?: AbortSignal,
 *   fetchFn?: typeof fetch,
 *   now?: () => number
 * }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new HttpError('network', 'API fetch indisponível neste ambiente.', { url });
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort(options.signal?.reason);
  };

  if (options.signal) {
    if (options.signal.aborted) {
      throw new HttpError('aborted', 'Requisição cancelada.', { url, cause: options.signal.reason });
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetchFn(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal
    });
  } catch (err) {
    if (timedOut) {
      throw new HttpError('timeout', `Tempo limite excedido (${timeoutMs} ms).`, { url, cause: err });
    }
    if (options.signal?.aborted || err?.name === 'AbortError') {
      throw new HttpError('aborted', 'Requisição cancelada.', { url, cause: err });
    }
    if (err instanceof TypeError) {
      throw new HttpError('network', 'Falha de rede ou bloqueio CORS ao acessar a API.', {
        url,
        cause: err
      });
    }
    throw new HttpError('network', err?.message || 'Erro de rede ao acessar a API.', {
      url,
      cause: err
    });
  } finally {
    clearTimeout(timerId);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  if (!response.ok) {
    const kind = classifyHttpStatus(response.status);
    const retryAfterHeader = response.headers?.get?.('Retry-After') ?? null;
    const retryAfterMs = kind === 'rate_limit' ? parseRetryAfterMs(retryAfterHeader, options.now?.()) : 0;
    throw new HttpError(kind, formatStatusMessage(kind, response.status), {
      status: response.status,
      retryAfterMs,
      url
    });
  }

  try {
    return await response.json();
  } catch (err) {
    throw new HttpError('parse', 'Resposta da API não contém JSON válido.', {
      status: response.status,
      url,
      cause: err
    });
  }
}

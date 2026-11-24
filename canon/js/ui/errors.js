/**
 * Central catalog translating typed application errors into clear, actionable Portuguese UI messages.
 * Cancellations never emit failure messages (`isCancellation: true`).
 * Zero globals, zero literal colors.
 */

function isNavigatorOffline(navigatorObj = globalThis.navigator) {
  return Boolean(navigatorObj && navigatorObj.onLine === false);
}

function getRawErrorToken(err) {
  if (!err) {
    return '';
  }
  return String(err.code || err.kind || err.name || '').trim();
}

/**
 * Formats any typed or generic error into an actionable Portuguese UI descriptor.
 * Never leaks internal URLs, stack traces, or API keys.
 *
 * @param {unknown} err
 * @param {{ context?: string, provider?: string, isMemoryFallback?: boolean, navigatorObj?: Navigator }} [options]
 * @returns {{
 *   code: string,
 *   isCancellation: boolean,
 *   severity: 'info' | 'warning' | 'error',
 *   message: string | null,
 *   action: string | null
 * }}
 */
export function formatUserError(err, options = {}) {
  const token = getRawErrorToken(err);
  const rawName = String(err?.name || '');
  const rawMsg = String(err?.message || '');
  const status = Number(err?.status || 0);
  const lowerMsg = rawMsg.toLowerCase();

  // 1. Voluntary cancellations are NOT errors
  if (
    token === 'EXPORT_CANCELLED' ||
    token === 'SHARE_CANCELLED' ||
    token === 'aborted' ||
    rawName === 'AbortError' ||
    err?.cancelled === true
  ) {
    return {
      code: token || 'CANCELLED',
      isCancellation: true,
      severity: 'info',
      message: null,
      action: null
    };
  }

  // 2. Missing API key
  if (token === 'missing_key') {
    const providerLabel = options.provider ? ` (${options.provider.toUpperCase()})` : '';
    return {
      code: 'missing_key',
      isCancellation: false,
      severity: 'warning',
      message: `Chave de API${providerLabel} não configurada. Adicione sua chave em Configurações ou preencha os campos manualmente.`,
      action: 'Configurar chave ou preencher manualmente'
    };
  }

  // 3. Authentication 401 / 403
  if (token === 'auth' || status === 401 || status === 403) {
    return {
      code: 'auth',
      isCancellation: false,
      severity: 'error',
      message: `Chave de API inválida ou sem permissão (HTTP ${status || '401/403'}). Confira sua chave em Configurações ou use entrada manual.`,
      action: 'Verificar chave em Configurações'
    };
  }

  // 4. Rate limit / quota 429 (including AniList 30 req/min sliding window)
  if (token === 'rate_limit' || status === 429) {
    return {
      code: 'rate_limit',
      isCancellation: false,
      severity: 'warning',
      message: 'Cota de requisições atingida (HTTP 429). Na AniList o limite é de 30 req/min — aguarde alguns segundos e tente novamente ou preencha manualmente.',
      action: 'Aguardar e tentar novamente'
    };
  }

  // 5. RAWG CORS / network block
  if (token === 'bloqueio-de-rede' || (options.provider === 'rawg' && token === 'network')) {
    return {
      code: 'bloqueio-de-rede',
      isCancellation: false,
      severity: 'warning',
      message: 'Não foi possível acessar a RAWG por bloqueio de CORS ou rede. Resultados em cache são preservados; caso contrário, preencha manualmente.',
      action: 'Usar preenchimento manual'
    };
  }

  // 6. IndexedDB / private mode / quota exceeded
  if (
    token === 'DB_UNAVAILABLE' ||
    token === 'DB_QUOTA' ||
    rawName === 'QuotaExceededError' ||
    rawName === 'SecurityError' ||
    rawName === 'InvalidStateError' ||
    options.isMemoryFallback ||
    lowerMsg.includes('indexeddb') ||
    lowerMsg.includes('cota') ||
    lowerMsg.includes('esgotado')
  ) {
    if (options.isMemoryFallback || rawName === 'SecurityError' || rawName === 'InvalidStateError' || lowerMsg.includes('privado') || lowerMsg.includes('memória')) {
      return {
        code: 'DB_UNAVAILABLE',
        isCancellation: false,
        severity: 'warning',
        message: 'Banco local (IndexedDB) indisponível neste modo do navegador: os dados serão perdidos ao fechar; exporte o canon.json.',
        action: 'Exportar canon.json'
      };
    }
    return {
      code: 'DB_QUOTA',
      isCancellation: false,
      severity: 'error',
      message: 'Espaço de armazenamento local esgotado ou bloqueado. Exporte o canon.json agora para evitar perda de dados.',
      action: 'Exportar canon.json'
    };
  }

  // 7. Offline / network / timeout
  if (
    token === 'network' ||
    token === 'timeout' ||
    err instanceof TypeError ||
    isNavigatorOffline(options.navigatorObj)
  ) {
    return {
      code: token === 'timeout' ? 'timeout' : 'network',
      isCancellation: false,
      severity: 'warning',
      message: isNavigatorOffline(options.navigatorObj)
        ? 'Você está sem conexão de rede. A busca externa está indisponível, mas a edição e exportação locais continuam funcionando.'
        : 'Falha de rede ou tempo limite ao consultar a API. Verifique sua conexão ou preencha a ficha manualmente.',
      action: 'Continuar offline / manual'
    };
  }

  // 8. Cover download / processing errors
  if (token === 'CORS_OR_NETWORK' || token === 'COVER_PROCESS_FAILED' || token === 'INVALID_IMAGE') {
    return {
      code: token,
      isCancellation: false,
      severity: 'warning',
      message:
        token === 'CORS_OR_NETWORK'
          ? 'A imagem da capa não pôde ser baixada (CORS ou rede). Use "Upload de capa local" ou salve com o placeholder editorial.'
          : 'Não foi possível processar a imagem escolhida. Tente outra foto JPG/PNG/WebP ou salve com placeholder.',
      action: 'Enviar imagem local'
    };
  }

  // 9. Poster PNG export errors
  if (
    token === 'CANVAS_UNAVAILABLE' ||
    token === 'TAINTED_CANVAS' ||
    token === 'EXPORT_TIMEOUT' ||
    token === 'BLOB_EMPTY' ||
    token === 'INVALID_WORK' ||
    token === 'DRAW_FAILED'
  ) {
    return {
      code: token,
      isCancellation: false,
      severity: 'error',
      message:
        token === 'TAINTED_CANVAS'
          ? 'Não foi possível exportar porque uma imagem externa contaminou o canvas. Substitua a capa por upload local e tente novamente.'
          : 'Não foi possível gerar o arquivo de imagem no navegador. Feche outras abas pesadas e tente novamente.',
      action: 'Tentar novamente'
    };
  }

  // 10. Video MP4 export errors
  if (token === 'VID_UNSUPPORTED' || token === 'MEDIABUNNY_LOAD_ERROR' || token === 'AUDIO_RENDER_ERROR' || token === 'ENCODER_ERROR') {
    return {
      code: token,
      isCancellation: false,
      severity: 'error',
      message:
        token === 'VID_UNSUPPORTED'
          ? 'Exportação de vídeo MP4 (H.264) não suportada neste navegador. Use a aba Pôster PNG para exportar.'
          : token === 'MEDIABUNNY_LOAD_ERROR'
            ? 'Não foi possível carregar o codificador local de MP4. Recarregue a página pelo servidor e tente novamente.'
            : 'Falha ao codificar o vídeo MP4. Mantenha a aba visível, experimente 30 fps ou use a aba Pôster PNG.',
      action: 'Usar 30 fps ou Pôster PNG'
    };
  }

  // 11. Share & download errors
  if (token === 'SHARE_NOT_ALLOWED' || token === 'SHARE_UNSUPPORTED' || token === 'SHARE_FAILED' || token === 'INVALID_FILE') {
    const isWarning = token === 'SHARE_NOT_ALLOWED' || token === 'SHARE_UNSUPPORTED';
    return {
      code: token,
      isCancellation: false,
      severity: isWarning ? 'warning' : 'error',
      message:
        token === 'SHARE_NOT_ALLOWED' || token === 'SHARE_UNSUPPORTED'
          ? 'Compartilhamento nativo indisponível ou bloqueado neste navegador. Use o botão "Baixar" ou "Abrir imagem".'
          : 'Não foi possível concluir o compartilhamento ou download do arquivo. Tente usar "Baixar".',
      action: 'Usar botão Baixar'
    };
  }

  // 12. API HTTP 404 / 5xx / JSON parse
  if (token === 'not_found' || status === 404) {
    return {
      code: 'not_found',
      isCancellation: false,
      severity: 'warning',
      message: 'Nenhum registro encontrado para essa consulta na API externa. Revise o título ou preencha manualmente.',
      action: 'Revisar busca ou editar manual'
    };
  }

  if (token === 'server' || (status >= 500 && status <= 599) || token === 'parse' || token === 'http') {
    return {
      code: token || 'http',
      isCancellation: false,
      severity: 'warning',
      message: 'A API externa retornou uma resposta instável no momento. Tente novamente em instantes ou preencha manualmente.',
      action: 'Preencher manualmente'
    };
  }

  // 13. Fallback without exposing raw technical internals
  const ctxLabel = options.context ? `${options.context}: ` : '';
  return {
    code: token || 'UNKNOWN_ERROR',
    isCancellation: false,
    severity: 'error',
    message: `${ctxLabel}Não foi possível concluir a operação. Tente novamente ou exporte seu canon.json como backup.`,
    action: 'Tentar novamente'
  };
}

/**
 * Formats and displays an error toast via `toast.error`/`toast.warning`, skipping cancellations cleanly.
 * @param {{ error?: (m: string) => void, warning?: (m: string) => void } | null | undefined} toast
 * @param {unknown} err
 * @param {{ context?: string, provider?: string, isMemoryFallback?: boolean, navigatorObj?: Navigator }} [options]
 */
export function presentErrorToast(toast, err, options = {}) {
  const formatted = formatUserError(err, options);
  if (formatted.isCancellation || !formatted.message || !toast) {
    return formatted;
  }
  if (formatted.severity === 'warning' && typeof toast.warning === 'function') {
    toast.warning(formatted.message);
  } else {
    toast.error?.(formatted.message);
  }
  return formatted;
}

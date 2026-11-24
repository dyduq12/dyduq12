# ADR-0014: Blindagem mobile (R3/R4), catálogo central de erros, backup e persistência

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 8 consolida a robustez da aplicação em celulares reais (Safari iOS e Chrome Android), acessibilidade por teclado/leitores de tela e tratamento uniforme de falhas antes do refinamento visual final. Foram identificadas fragilidades de UX móvel (risco de scroll horizontal em 360 px, diálogos em paisagem de baixa altura, captura/limpeza de ponteiros ao re-renderizar cards), mensagens de erro dispersas e ausência de lembrete de backup ou pedido progressivo de armazenamento persistente.

## Decisões

1. **Catálogo central e captura global de erros (`js/ui/errors.js` e `js/ui/global-errors.js`):**
   - Toda exceção esperada (`HttpError`, `bloqueio-de-rede` da RAWG, erros de `cover.js`, `PosterExportError`, `VideoExportError`, `ShareError`, falhas de `db.js`/cota) é traduzida por `formatUserError` / `presentErrorToast` em mensagens acionáveis em português, sem vazar URLs, chaves ou stack traces.
   - Cancelamentos voluntários (`AbortError`, `EXPORT_CANCELLED`, `SHARE_CANCELLED`, `aborted`) são tratados explicitamente como não-erros (`isCancellation: true`) e nunca disparam toasts de falha.
   - `installGlobalErrorHandlers` captura eventos `'error'` e `'unhandledrejection'` na `window` sem criar globais novas, registrando detalhes estruturados no console e apresentando aviso seguro ao usuário.
   - Eliminados blocos `catch` vazios em toda a base `js/`, registrando `console.warn` ou tratando o retorno explicitamente.

2. **Blindagem de ponteiros R3 e ciclo de vida (`sliders.js`, `card.js`, `gallery.js`, `dock.js`):**
   - Mantidos `setPointerCapture` (protegido em `try/catch`), confirmação apenas em `pointerup` válido e cancelamento integral em `pointercancel` e `lostpointercapture` com tentativa segura de `releasePointerCapture`.
   - `createWorkCard`, `createScoreSlider`, `createWorkFormPanel` e `mountAiImportPanel` passam a expor rotinas `destroy()`; `gallery.js` destrói instâncias anteriores antes de re-renderizar para evitar listeners ou capturas órfãs.
   - Aplicado `touch-action: manipulation` em botões/links (reduz atraso de duplo toque), `user-select: none` restrito apenas às áreas de gesto (`.canon-slider-track`, `.canon-card-flip-btn`, `.canon-mascot-canvas`), e mantido `pan-y` em cards e canvas dos mascotes.

3. **Layout mobile R4 e Acessibilidade (`index.html`, `css/base.css`, `css/card.css`, `css/studio.css`, `studio.js`):**
   - Adicionados `<link rel="icon" href="data:,">` (evita 404 de favicon no console) e `<noscript>` acessível em português.
   - Ajustados `min-width: 0`, `overflow-wrap: anywhere` e empilhamento em `@media (max-width: 380px)` para eliminar scroll horizontal em viewports de 360 px, além de regras dedicadas para orientação paisagem de baixa altura no Estúdio e `100vh` sempre pareado com `100dvh`.
   - Contenção de foco (`Tab`/`Shift+Tab`) adicionada ao modal Estúdio (`js/export/studio.js`), `aria-expanded`/`aria-controls` no fallback de prompt em `ai-import.js` e agrupamento semântico `<fieldset>`/`<legend>` para os 6 sliders.

4. **Lembrete de backup e `navigator.storage.persist()` (`js/ui/backup.js`):**
   - `evaluateBackupReminder` utiliza constante nomeada `BACKUP_REMINDER_DAYS = 7` e exibe alerta dispensável quando existem obras locais nunca exportadas ou modificadas após um backup com mais de 7 dias (bem como alerta não dispensável se o fallback em memória estiver ativo).
   - `requestPersistentStorageOnce` chama `navigator.storage.persist()` de forma progressiva **uma única vez** após o primeiro salvamento real do usuário, gravando a marca em `STORES.META` e degradando sem erro quando a API é ausente.

## Riscos Conhecidos e Pendentes de Verificação Manual

- **Remoção automática (eviction) do IndexedDB por inatividade:** navegadores móveis (especialmente Safari/WebKit e Chrome em armazenamento pressionado) podem descartar dados do IndexedDB caso o site fique sem uso prolongado e `navigator.storage.persist()` não seja concedido automaticamente pelo sistema operacional. Este comportamento depende de teste manual em dispositivo real (registrado em `docs/VERIFICACAO_MANUAL.md`).
- **Comportamento real de hardware WebCodecs / iOS 26+ / Android share sheet:** validado em testes unitários e estáticos em Node; requer execução do checklist completo em `docs/VERIFICACAO_MANUAL.md`.

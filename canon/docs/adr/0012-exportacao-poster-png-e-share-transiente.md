# ADR-0012: Exportação de pôster PNG (1080x1350), origem segura de capas e compartilhamento síncrono

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 6 gera pôsteres editoriais `1080x1350` em PNG no cliente para download ou compartilhamento via Web Share API (`navigator.share` com `File`). Em navegadores móveis (especialmente Safari/iOS), a ativação transitória do gesto do usuário expira se houver qualquer operação assíncrona (`await` de renderização no `<canvas>`) antes da chamada a `navigator.share`. Além disso, qualquer imagem externa desenhada diretamente no canvas contamina o contexto (*tainted canvas*, Regra R2) e quebra `canvas.toBlob()`.

## Decisões

1. **Separação entre cálculo de layout e desenho Canvas 2D (`layout.js` + `poster.js`):**
   - `js/export/layout.js` permanece puro e sem DOM, calculando todos os retângulos dentro de `1080x1350`, ajustando tamanho de fonte e quebras de linha (até 3 linhas) via função `measure` injetada.
   - `js/export/poster.js` expõe `drawPoster(ctx, data, layout, theme)` (reutilizável em frames de vídeo da Fase 7) e `renderPoster(work, theme, options)` retornando `{ canvas, blob, layout, warning }`.
   - Fontes CSS são resolvidas via `getComputedStyle` no painel Estúdio antes do desenho (pois `ctx.font` não aceita `var()`), e todas as cores vêm exclusivamente dos tokens de tema (`paper` ou `slate`) e da paleta salva da obra (`--work-a`/`--work-b`).
   - O grão editorial usa o PRNG determinístico `createSeededRng` com `globalAlpha` (zero `Math.random`), e os mascotes opcionais reutilizam `createWorld` + `drawWorld` de `js/mascots/engine.js`.

2. **Origem exclusiva das capas (Regra R2):**
   - `resolveSafeCoverBlob` aceita apenas `Blob` local do store `covers` no IndexedDB (`cover:*`), caminhos relativos `covers/...` same-origin ou `Blob` explicitamente injetado. Referências `http:`/`https:` ou traversal são bloqueadas com aviso e queda automática para placeholder geométrico com monograma e paleta da obra.
   - `createImageBitmap` é sempre encerrado (`close()`) no bloco `finally`, e `canvas.toBlob(..., 'image/png')` roda com timeout explícito, tratando `SecurityError` e retorno nulo como `PosterExportError` tipado.

3. **Pré-renderização no Estúdio e `navigator.share` síncrono (`studio.js` + `share.js`):**
   - O painel Estúdio pré-renderiza o PNG assim que abre e após mudanças de opção (tema Papel Fosco / Ardósia Noturna ou exibição dos mascotes) com debounce, mantendo o botão **Compartilhar** como `"Gerando..."` (desabilitado) até o `File` (`canon-<slug>.png`, `image/png`) ficar pronto.
   - Ao clicar em **Compartilhar**, `shareFile` invoca `navigator.share({ files: [file], title, text })` **sincronamente** no handler antes de qualquer `await`.
   - `AbortError` é tratado como cancelamento voluntário do usuário (sem toast de erro); `NotAllowedError`, `TypeError` ou ausência de `canShare({ files })` acionam o fallback automático de download (`<a download>` com revogação atrasada da `ObjectURL`), complementado por `"Abrir imagem"` para salvamento via toque longo no iOS.

## Consequências

- A ativação transitória do clique é preservada em Android e iOS sem race condition entre renderização do canvas e abertura da folha de compartilhamento nativa.
- Nenhum código de exportação possui cores literais ou URLs externas, preservando a integridade da suite `colors.test.js` e preparando `drawPoster` para reutilização na Fase 7.

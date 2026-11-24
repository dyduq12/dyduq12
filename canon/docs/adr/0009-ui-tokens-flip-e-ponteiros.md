# ADR-0009: Tokens centralizados, Flip 3D seguro e Gestos de Ponteiro (R3)

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 3 introduz a interface editorial funcional do CANON mantendo estrita separação entre tokens visuais e componentes, acessibilidade completa por teclado/leitor de tela, compatibilidade mobile/Safari e zero dependências externas. Três pontos exigem registro arquitetural explícito:

1. Centralização absoluta de cores e verificação automatizada de contraste nos dois temas (`paper` e `slate`).
2. Bugs conhecidos do WebKit/Safari em elementos com `transform-style: preserve-3d` quando combinados com `filter`, `overflow: hidden` ou `opacity < 1`.
3. Convivência entre rolagem vertical em telas móveis e acionamento de flip/slider por Pointer Events (Regra R3).

## Decisões

1. **Centralização em `css/tokens.css`:**
   - Todos os valores cromáticos, tipografia do sistema, espaçamentos, raios e durações residem exclusivamente em `css/tokens.css` sob `[data-theme="paper"]` e `[data-theme="slate"]`.
   - `base.css`, `card.css` e `index.html` não declaram cores literais; derivam transparências com `color-mix(in srgb, var(--token) ..., transparent)`.
   - A única exceção dinâmica em JS é a aplicação das cores da paleta da obra via `element.style.setProperty('--work-a', ...)` e `--work-b` (cujos valores padrão também constam em `tokens.css` e `js/core/schema.js`).
   - A preferência de tema é persistida no store `meta` do IndexedDB (`meta.theme`), usando `prefers-color-scheme` como padrão inicial.

2. **Flip 3D seguro para Safari/WebKit e leitores de tela:**
   - O contêiner que rotaciona (`.canon-card-inner`) aplica exclusivamente `transform-style: preserve-3d` e `transition: transform ...`, **sem** `filter`, `overflow: hidden` ou `opacity < 1`.
   - Recortes (`overflow: hidden`) e bordas ficam em um elemento filho interno (`.canon-card-surface`), e o brilho cromático (`--work-a`/`--work-b`) fica no contêiner externo (`.canon-card-shell`), fora da árvore `preserve-3d`.
   - Cada face usa `backface-visibility: hidden` e `-webkit-backface-visibility: hidden`.
   - A face oculta recebe `inert = true` e `aria-hidden = "true"` a cada troca, impedindo foco por teclado e leitura indevida em leitores de tela.

3. **Gestos de Ponteiro (R3) em Cards e Sliders:**
   - **Cards:** usam `touch-action: pan-y` para não bloquear a rolagem vertical em dispositivos móveis. O `pointerdown` registra coordenadas iniciais e chama `setPointerCapture`; o `pointerup` só confirma o flip se o deslocamento for `<= 10 px`; `pointercancel` e `lostpointercapture` cancelam o gesto sem flipar. O `click` sintético subsequente a um gesto de ponteiro é suprimido para evitar duplo flip, preservando ativação por teclado (`Enter`/`Espaço`). Botões internos (`Editar`, `Remover`) ficam fora do botão de flip e marcados com `[data-no-flip]`.
   - **Sliders:** usam `touch-action: none` e `setPointerCapture`. O `pointerdown` salva `previousValue`; `pointerup` confirma e limpa `activePointerId` antes da perda de captura; `pointercancel` e `lostpointercapture` durante o arraste restauram `previousValue`.

## Consequências

- A suíte `tests/colors.test.js` garante em CI/Node que nenhuma cor literal ou proibida vaze fora de `tokens.css` e que ambos os temas respeitem razão de contraste `>= 4,5:1`.
- O modelo de exibição do card (`js/ui/card-model.js`) permanece 100% puro e testável sem DOM.

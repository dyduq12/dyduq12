# ADR-0011: Motor determinístico de mascotes, mapeamento, áudio e pausa do loop

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 5 introduz os 4 mascotes geométricos (**KOMA**, **SAVE**, **KINO**, **ECHO**), síntese Web Audio procedural e vibração opcional. Além da interatividade em tempo real no dock da UI, o mesmo motor e as mesmas vozes de áudio serão reutilizados na Fase 7 para renderização determinística de vídeo MP4 frame a frame com `OfflineAudioContext`.

## Decisões

1. **Motor determinístico puro (`js/mascots/engine.js` e `koma/save/kino/echo.js`):**
   - Estado isolado em funções puras sem DOM: `createWorld({ seed })`, `setInputs(world, inputs)`, `advance(world, dt)`, `snapshot(world)` e `draw(ctx, state, rect, theme)`.
   - PRNG com semente (`mulberry32`) no lugar de `Math.random()`, e proibição total de `Date.now()` / `performance.now()` em `js/mascots/*`.
   - Integração de molas semi-implícita de Euler em passo fixo `dt = 1/60`, com acumulador e limite máximo de `5` passos por quadro (`MAX_STEPS_PER_FRAME`) para evitar espiral de lag, garantindo todos os valores finitos.
   - Todas as cores vêm de um objeto `theme` resolvido em `dock.js` a partir de `css/tokens.css` e da paleta da obra; transparências usam `ctx.globalAlpha`.

2. **Regras de mapeamento e interpretações adotadas:**
   - **KOMA:** `>= 9,0` ativa linhas de impacto estilo shonen; `6,0` a `8,9` aplica inclinação proporcional; `< 5,0` desenha rachaduras; a faixa não especificada **`5,0` a `5,9` é tratada como neutra** (sem impacto, inclinação nem rachaduras).
   - **SAVE:** usa `--work-a` e `--work-b` (`palette` da obra) para o brilho do cristal poligonal; gira rápido no evento de salvamento (`work:saved`) e enquanto `geral >= 9,0` (Hall da Fama).
   - **KINO:** abre/fecha a lente por molas conforme `gameplay_ritmo` e `graficos_fotografia`, disparando piscada de obturador quando qualquer uma dessas duas notas muda.
   - **ECHO:** modula amplitude e velocidade dos anéis por `trilha` e `direcao_arte`, e mapeia a oitava do tom conforme a nota; o **combo visual** ativa quando **2 ou mais** dentre os 5 critérios (`historia`, `gameplay_ritmo`, `graficos_fotografia`, `trilha`, `direcao_arte`) atingem `10` simultaneamente.
   - **Obra de contexto atual no dock:** segue a precedência **formulário aberto/ativo > último card virado > estado neutro**.

3. **Áudio procedural, desbloqueio e pausa do loop:**
   - Padrão inicial: **silenciado** (`aria-pressed="false"` no botão "Som").
   - `unlock.js` cria/retoma o `AudioContext` de forma **síncrona** dentro do handler do primeiro gesto do usuário (sem `await` antes de `resume()`), tratando estados `suspended` e `interrupted` (iOS) em novos gestos e `visibilitychange`.
   - `synth.js` aceita `BaseAudioContext` com `DynamicsCompressorNode` na saída mestre e aplica throttle (~`80 ms`) no som de tick durante arraste de sliders.
   - `dock.js` mantém um único loop `requestAnimationFrame` pausado automaticamente em `document.hidden` (`visibilitychange`) e quando fora da viewport (`IntersectionObserver`); em `prefers-reduced-motion: reduce`, desenha apenas quadros estáticos sob demanda.

## Consequências

- O mesmo núcleo (`engine.js` + `synth.js`) serve tanto ao dock interativo quanto à exportação determinística da Fase 7 sem duplicação de física ou áudio.
- Testes em Node verificam determinismo, limiares exatos, chamadas de canvas 2D e agendamento em `OfflineAudioContext` sem navegador.

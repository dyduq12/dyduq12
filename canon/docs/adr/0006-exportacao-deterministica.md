# ADR-0006: Exportação de vídeo determinística frame a frame e áudio offline

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

A Fase 7 exige exportar um vídeo vertical MP4 (`1080x1920`, ~7 s) combinando animações dos mascotes/cards e trilha/efeitos sintetizados por Web Audio. Se a renderização de vídeo dependesse de `requestAnimationFrame` em tempo real ou de gravação de áudio em tempo real (`MediaRecorder`), qualquer engasgo de CPU causaria frames perdidos, duração variável, dessincronização entre imagem e som e falhas em aparelhos móveis.

## Opções Consideradas

- **Opção 1 — Captura em tempo real (`captureStream` + `MediaRecorder` + `requestAnimationFrame`):** não determinística, dependente da taxa de atualização da tela, sujeita a *stutter* e qualidade inconsistente entre navegadores.
- **Opção 2 — Pipeline determinístico offline frame a frame + `OfflineAudioContext`:** desacopla completamente o tempo simulado do relógio de parede (*wall-clock*).

## Decisão

Adotar **renderização determinística frame a frame** e **áudio pré-renderizado offline** (Regra R6):

- **Motor visual puro no tempo:** toda animação dos mascotes e elementos do vídeo é uma função pura do tempo simulado `t`, avançando com passo fixo `dt = 1/60` (ou `1/30` no modo degradado), sem `requestAnimationFrame` em tempo real e sem `Math.random()` não determinístico (sem semente).
- **Áudio offline:** a trilha e os efeitos sonoros (~7 s) são sintetizados previamente via `OfflineAudioContext`, gerando buffers exatos alinhados aos timestamps dos frames.
- **Controle de recursos e degradação:**
  - Verificar `canEncode` antes de iniciar; se `1080x1920` a `60 fps` não for suportado, degradar para `30 fps`; se AAC/áudio não for suportado, exportar sem áudio e avisar o usuário.
  - Ceder a thread principal periodicamente a cada poucos frames para atualizar o progresso e permitir cancelamento limpo pelo usuário sem travar a aba.
  - Usar Wake Lock como melhoria progressiva (quando disponível) e exibir aviso para manter a aba aberta durante a exportação.

## Consequências

### Positivas
- Vídeo resultante tem duração exata, framerate constante e sincronia perfeita entre animação e áudio, mesmo em dispositivos mais lentos.
- Elimina dependência da taxa de refresh do monitor do usuário (60 Hz vs 120 Hz).
- Facilita testes de regressão e depuração reproduzível do motor de animação.

### Negativas
- O tempo total de exportação pode ser maior que a duração do vídeo em hardware limitado.
- Exige que o motor de mascotes (Fase 5) seja projetado desde o início com estado determinístico em função de `t` e passo fixo.

### Riscos e Mitigações
- **Congelamento da UI durante codificação intensa:** ceder a thread regularmente (`setTimeout(0)` / micro-pausas entre lotes de frames) e suportar cancelamento limpo com liberação de recursos.
- **Limitações de codec em hardware específico:** verificação prévia `canEncode` com fallback automático documentado acima.

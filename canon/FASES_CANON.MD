# FASES_CANON.md — Roteiro determinístico do projeto CANON

Projeto: aplicação web estática, 100% client-side, publicada em `dyduq12.github.io/canon/`.
Escopo desta etapa: motor funcional + interface editorial limpa e funcional.
Fora de escopo (reservado para refinamento posterior): ver seção "Reservado" de cada fase.

## Regras globais de higiene (valem para TODAS as fases)

### R1. Escopo e módulos
- [ ] Usar ES Modules (`<script type="module">`). Nenhuma variável global além de um único objeto opcional `window.CANON_DEBUG` (somente leitura, para depuração).
- [ ] Sem bibliotecas por CDN em runtime, exceto Mediabunny, instalado via npm e empacotado/copiado para `vendor/` (versão fixa registrada em ADR).
- [ ] Caminhos relativos (sem `/` inicial), porque o site roda em subpasta (`/canon/`).
- [ ] Testar sempre via servidor estático local; `file://` não é suportado.

### R2. Proteção contra tainted canvas
- [ ] Toda capa externa é baixada com `fetch` e convertida em Blob local ao SALVAR a obra (redimensionada para ~600x900, WebP).
- [ ] O canvas de pôster, vídeo e extração de cor só desenha imagens de Blob local ou de `covers/` (same-origin). Nunca desenhar URL externa diretamente.
- [ ] Se o `fetch` da capa falhar (CORS), cair para upload manual e para capa placeholder; nunca quebrar a exportação.
- [ ] Toda chamada a `toBlob`/`getImageData` fica dentro de `try/catch` com mensagem de erro clara na interface.
- [ ] A paleta (2 cores dominantes) é calculada uma vez ao salvar e gravada no registro da obra.

### R3. Gestos de ponteiro
- [ ] Usar Pointer Events. `pointerdown` chama `setPointerCapture`.
- [ ] `pointerup` confirma o gesto. `pointercancel` e `lostpointercapture` CANCELAM o gesto (limpam estado, não confirmam valor).
- [ ] `touch-action: none` em sliders e áreas de arraste; `touch-action: pan-y` em listas roláveis.

### R4. Layout mobile
- [ ] Altura de tela com `100vh` como fallback seguido de `100dvh`.
- [ ] Respeitar `env(safe-area-inset-*)`.
- [ ] Respeitar `prefers-reduced-motion`.

### R5. Dados e cache
- [ ] Todo cache de API fica no IndexedDB com TTL e chave `provider:query`.
- [ ] Debounce de 400-600 ms na busca e fila de requisições para a AniList (teto atual divulgado: 30 req/min; tratar HTTP 429 com espera).
- [ ] RAWG: cache agressivo; em `TypeError` (CORS/rede), cair para cache e depois para entrada manual.
- [ ] `canon.json` e registros têm `schemaVersion` e IDs no formato `provider:id` (ou `manual:uuid`).

### R6. Exportação de vídeo
- [ ] Antes de gravar, rodar `canEncode`/verificação de codec do Mediabunny para vídeo (H.264) e áudio (AAC).
- [ ] Se 1080x1920 a 60 fps não for suportado, cair para 30 fps; se áudio não for suportado, exportar sem áudio e avisar.
- [ ] Renderização determinística frame a frame (nada de `requestAnimationFrame` em tempo real): animação = função pura do tempo `t`, passo fixo `dt = 1/60`, sem `Math.random()` sem semente.
- [ ] Áudio renderizado antes via `OfflineAudioContext`.
- [ ] Confirmar as assinaturas exatas da API na documentação oficial do Mediabunny antes de codar (Context7 pode ser usado).

### R7. Segurança e cores
- [ ] Nenhuma chave de API no repositório. Chaves só no IndexedDB do usuário.
- [ ] Proibido `#FFFFFF`, `#000000` e bege chapado. Todas as cores vêm de variáveis em `css/tokens.css`. Existe teste automatizado que falha se encontrar `#fff`, `#ffffff`, `#000`, `#000000`, `white` ou `black` fora de comentários.
- [ ] Atribuições visíveis no rodapé: RAWG (backlink), TMDB e AniList (texto e link).

## Estrutura de pastas alvo
CANON/
index.html
FASES_CANON.md
README.md
.gitignore
package.json (somente dev: testes e servidor local)
css/ tokens.css base.css card.css studio.css
js/
main.js
core/ schema.js db.js store.js events.js
api/ http.js cache.js anilist.js tmdb.js rawg.js search.js
media/ cover.js palette.js
ui/ app-shell.js gallery.js card.js form.js sliders.js settings.js toast.js
ai/ prompt-template.js parser.js
mascots/ engine.js koma.js save.js kino.js echo.js
audio/ unlock.js synth.js offline-render.js
export/ poster.js video.js share.js
data/canon.json
covers/ (capas exportadas, same-origin)
vendor/ (Mediabunny, versão fixa)
docs/adr/ (um arquivo por decisão)
tests/ (node --test)

text

---

## Fase 0 — Preparação e decisões (ADRs)

**Objetivo técnico:** estrutura inicial, servidor local e decisões registradas antes do código.

**Arquivos:** `FASES_CANON.md`, `README.md`, `.gitignore`, `package.json`, `docs/adr/0001..0006-*.md`.

ADRs obrigatórios:
- 0001 Persistência híbrida (`canon.json` + IndexedDB)
- 0002 Estratégia de capas same-origin (R2)
- 0003 Mediabunny no lugar de `mp4-muxer` (depreciado)
- 0004 Chaves de API só no IndexedDB do usuário
- 0005 AniList no lugar de Jikan (API pública do Jikan descontinuada)
- 0006 Exportação determinística frame a frame

**Critérios de aceite**
- [x] `npm run serve` abre um servidor estático local.
- [x] 6 ADRs criados, cada um com contexto, decisão e consequências.
- [x] `.gitignore` cobre `node_modules/`, `.env*`, arquivos de sistema.

**Reservado para depois:** identidade visual, logotipo, textos finais do README.

---

## Fase 1 — Fundação Core & Banco Híbrido

**Objetivo técnico:** schema de dados, IndexedDB, store reativo e leitura do `canon.json`.

**Arquivos:** `js/core/schema.js`, `db.js`, `store.js`, `events.js`, `data/canon.json` (com 3 obras de exemplo, uma por mídia), `tests/schema.test.js`, `index.html` (shell mínimo), `js/main.js`.

Modelo mínimo de obra: `id`, `type` (game|movie|series|anime), `title`, `year`, `genre`, `studio`, `director`, `soundtrack`, `starring`, `cover` (caminho ou chave de Blob), `palette` (2 cores), `scores` (geral, historia, gameplay_ritmo, graficos_fotografia, trilha, direcao_arte), `pros[]`, `cons[]`, `status`, `verdict`, `createdAt`, `updatedAt`.

**Critérios de aceite**
- [ ] Visitante sem dados locais vê as obras do `canon.json`. *(pendente de verificação manual no navegador; `store.init()` e HTTP `200` validados)*
- [ ] Adicionar/editar/remover uma obra grava no IndexedDB e persiste após recarregar. *(pendente de verificação manual no navegador real)*
- [x] Mesclagem: registro local com mesmo `id` sobrepõe o de `canon.json`.
- [ ] Botão "Exportar canon.json" baixa um arquivo válido e versionado. *(pendente de verificação manual do download no navegador; payload validado em teste)*
- [ ] Botão "Importar canon.json" valida pelo schema e recusa arquivo inválido com mensagem. *(pendente de verificação manual via UI; `importCanonJson` validado em teste)*
- [x] `node --test` passa nos testes de schema.

**Reservado:** aparência final, animações de entrada.

---

## Fase 2 — Camada de APIs, cache e capas

**Objetivo técnico:** busca por nome em AniList, TMDB e RAWG com cache, debounce, fila e conversão de capa para Blob local.

**Arquivos:** `js/api/http.js`, `cache.js`, `anilist.js`, `tmdb.js`, `rawg.js`, `search.js`, `js/media/cover.js`, `palette.js`, `js/ui/settings.js`, `tests/cache.test.js`.

**Critérios de aceite**
- [x] AniList: consulta GraphQL via POST sem chave, retornando título, capa, ano, estúdio e staff; fila respeitando 30 req/min e tratamento de 429.
- [x] TMDB: busca de filmes/séries com chave lida do IndexedDB (tela Configurações); créditos para direção e elenco.
- [x] RAWG: busca de jogos com chave do usuário; em `TypeError`, usa cache e depois entrada manual, sem travar a interface.
- [x] Cache no IndexedDB com TTL; segunda busca idêntica não gera requisição de rede.
- [ ] Capa baixada vira Blob WebP ~600x900; paleta de 2 cores calculada por quantização em ~32x32. *(pendente de verificação manual do canvas/toBlob no navegador; quantização pura validada em `tests/palette.test.js`)*
- [ ] Todos os campos vindos da API ficam editáveis; upload de imagem local funciona. *(pendente de verificação manual do upload/canvas no navegador)*
- [x] Sem chave configurada, a interface explica o que fazer e mantém a entrada manual.

**Reservado:** estilo dos resultados de busca, microinterações.

---

## Fase 3 — Interface editorial funcional (base limpa)

**Objetivo técnico:** galeria, card com flip 3D, formulário e sliders, com variáveis centralizadas.

**Arquivos:** `css/tokens.css`, `base.css`, `card.css`, `js/ui/app-shell.js`, `gallery.js`, `card.js`, `form.js`, `sliders.js`, `toast.js`, `tests/colors.test.js`.

**Critérios de aceite**
- [ ] `tokens.css` concentra TODAS as cores, fontes, espaçamentos, raios e durações (modos Papel Fosco e Ardósia Noturna, alternáveis). *(tokens e contraste validados em `tests/colors.test.js`; alternância visual pendente de verificação manual)*
- [x] Teste de cores (R7) passa.
- [ ] Frente do card: capa, título em caixa alta, ano, ficha técnica (Genre, Developed By/Studio, Directed By, Soundtrack, Starring). *(modelo puro validado em `tests/card-model.test.js`; renderização visual pendente de verificação manual)*
- [ ] Verso: 5 barras de critérios, prós, contras, status, veredito. *(modelo puro validado em `tests/card-model.test.js`; layout visual pendente de verificação manual)*
- [ ] Flip 3D por toque/clique, com teclado (Enter/Espaço) e `aria-label`. *(pendente de verificação manual no navegador)*
- [ ] Sliders de nota (0 a 10, passo 0,5) seguem R3 (cancelamento por `pointercancel`). *(pendente de verificação manual no navegador)*
- [ ] Layout usa `100vh`/`100dvh` e safe areas (R4). *(regras presentes em `css/base.css`; validação em 360px/mobile pendente de verificação manual)*
- [ ] Granulado SVG procedural leve como fundo, gerado uma vez. *(definido em `css/tokens.css`/`base.css`; inspeção visual pendente de verificação manual)*
- [x] Rodapé com atribuições (R7).

**Reservado:** tipografia condensada final, diagramação de jornal, refinamento do grão, transições finas.

---

## Fase 4 — Importação "Colar da IA"

**Objetivo técnico:** prompt padrão e parser com validação.

**Arquivos:** `js/ai/prompt-template.js`, `js/ai/parser.js`, `tests/parser.test.js`, painel de importação em `js/ui/form.js`.

**Critérios de aceite**
- [ ] Botão "Copiar prompt padrão" entrega ao usuário um modelo que pede um bloco JSON em código com campos fixos (título, tipo, notas, prós, contras, status, veredito). *(prompt e ida e volta validados em `tests/prompt-template.test.js`; clipboard/fallback no navegador pendente de verificação manual)*
- [ ] O parser aceita o bloco colado, valida pelo schema e mostra uma PRÉVIA antes de salvar. *(parser validado em `tests/parser.test.js`; prévia visual no navegador pendente de verificação manual)*
- [ ] Após o parse, dispara a busca de metadados; falha na busca não perde as notas. *(mesclagem validada em `tests/import-merge.test.js`; fluxo no navegador pendente de verificação manual)*
- [x] Erros do parser são específicos (campo, motivo). Testes cobrem entrada válida, campo faltando, nota fora do intervalo e texto sem bloco.

**Reservado:** redação final do prompt e microcopy.

---

## Fase 5 — Motor de mascotes, áudio e vibração (formas simples)

**Objetivo técnico:** engine única de molas com 4 skins geométricas simples; arte final vem depois.

**Arquivos:** `js/mascots/engine.js`, `koma.js`, `save.js`, `kino.js`, `echo.js`, `js/audio/unlock.js`, `synth.js`, `offline-render.js`.

**Critérios de aceite**
- [ ] Engine com passo fixo e estado puro em função do tempo (necessário para a Fase 7); um único loop de animação, pausado com a aba oculta. *(engine pura e determinismo validados em `tests/mascots.test.js`; desenho real e pausa do loop no navegador pendentes de verificação manual)*
- [x] KOMA reage à Nota Geral e História (linhas de impacto 9,0-10; inclinação 6,0-8,9; trinca < 5,0).
- [x] SAVE usa a paleta salva; gira ao salvar e no Hall da Fama (>= 9,0).
- [x] KINO reage a Gameplay/Ritmo e Gráficos/Fotografia (mola e piscada).
- [x] ECHO reage a Trilha e Direção de Arte; combo visual quando dois critérios chegam ao máximo.
- [ ] Áudio: `AudioContext` criado/retomado dentro do primeiro gesto (`resume()` síncrono no handler); começa silenciado; trata estado `suspended`/`interrupted`; retoma no `visibilitychange`. *(lógica validada com mocks em `tests/audio.test.js`; desbloqueio no iOS/navegador pendente de verificação manual)*
- [ ] Sons sintetizados (sem arquivos de áudio): estalo, acorde ascendente, obturador, oitava variável. *(síntese e `OfflineAudioContext` validados com mocks em `tests/audio.test.js`; som audível no navegador pendente de verificação manual)*
- [ ] `navigator.vibrate` é opcional: checar existência, sem erro quando ausente. *(guarda validada em `tests/audio.test.js`; vibração real no Android pendente de verificação manual)*

**Reservado:** arte SVG final dos mascotes, personalidade, refinamento de física e sons.

---

## Fase 6 — Exportação do pôster PNG (1080x1350)

**Arquivos:** `js/export/poster.js`, `js/export/share.js`, `css/studio.css`, painel "Estúdio" em `js/ui/`.

**Critérios de aceite**
- [ ] Gera PNG 1080x1350 usando só imagens locais (R2). *(layout 1080x1350, bloqueio R2 de URL externa e fluxo de desenho validados com mocks em Node; geração real de PNG e prévia no navegador pendentes de verificação manual)*
- [ ] Download funciona; compartilhamento usa `navigator.canShare({files})` antes de `navigator.share`, dentro de um gesto do usuário, com `File` (`image/png`) e fallback para download. *(slug, `File`, `canShareFile`, chamada síncrona, `AbortError` e fallback validados em `tests/share.test.js`; download real e `navigator.share` no Android/iOS pendentes de verificação manual)*
- [x] Erros (canvas contaminado, falta de memória) mostram mensagem e não travam.

**Reservado:** layout editorial final do pôster, tipografia.

---

## Fase 7 — Exportação de vídeo MP4 (Mediabunny)

**Arquivos:** `js/export/video.js`, `js/audio/offline-render.js` (ajustes), `vendor/mediabunny/`, ADR de versão.

**Critérios de aceite**
- [ ] Verificação `canEncode` antes de iniciar (R6), com degradação 60->30 fps e sem áudio. *(ordem `canEncodeVideo`/`canEncodeAudio`, fallback 60→30 fps, export sem áudio em falha AAC e erro `VID_UNSUPPORTED` validados com mock em `tests/video.test.js`; WebCodecs real no navegador pendente de verificação manual)*
- [ ] Áudio de ~7 s renderizado com `OfflineAudioContext`. *(timeline pura de 7 s validada em `tests/timeline.test.js` e agendamento `OfflineAudioContext` em `tests/audio.test.js`; renderização real de áudio no navegador pendente de verificação manual)*
- [ ] Vídeo 1080x1920, ~7 s, renderizado frame a frame com timestamps fixos; cede a thread a cada poucos frames e mostra progresso. *(layout 1080×1920, física 1/60 determinística, 420/210 frames exatos, yields `MessageChannel` e progresso monotônico validados em `tests/video-frame.test.js` e `tests/video.test.js`; codificação real MP4 pendente de verificação manual)*
- [ ] Arquivo `video/mp4` gerado, baixável e compartilhável como `File`. *(`Blob` `video/mp4`, `File` `canon-*.mp4` e wrapper `navigator.share`/download validados em `tests/video.test.js` e `tests/share.test.js`; download e share sheet reais no navegador pendentes de verificação manual)*
- [ ] Cancelamento limpo (botão), sem vazamento de memória. *(cancelamento via `AbortController`, `output.cancel()` e liberação de bitmap/canvas validados em `tests/video.test.js`; botão Cancelar na UI e inspeção de memória no navegador pendentes de verificação manual)*
- [ ] Tentativa de wake lock como melhoria progressiva (sem erro se ausente). *(chamada protegida a `navigator.wakeLock.request('screen')` e `release()` em `finally` implementados em `js/export/studio.js`; teste em dispositivo móvel pendente de verificação manual)*
- [x] Aviso ao usuário para manter a aba aberta durante a exportação. *(banner permanente na aba Vídeo do Estúdio e detecção de `document.hidden` validada em `tests/video.test.js`)*

**Reservado:** coreografia final da animação e trilha musical.

---

## Fase 8 — Blindagem mobile e acessibilidade

**Critérios de aceite**
- [x] Revisão de todos os handlers de ponteiro conforme R3. *(auditoria de `pointerdown`/`setPointerCapture`/`pointercancel`/`lostpointercapture`, `touch-action` e ciclo de vida com `destroy()` validada em `tests/pointer-audit.test.js`)*
- [ ] Teste de viewport estreito (360x640) e largo; sem rolagem horizontal. *(regras CSS de quebra, largura fluida, `100vh`/`100dvh` e paisagem aplicadas em `css/base.css`, `card.css` e `studio.css`; inspeção visual em 360×640 e celular pendente de verificação manual)*
- [ ] Foco visível, navegação por teclado, `prefers-reduced-motion` desliga flip animado e mascotes contínuos. *(HTML/CSS estático e contenção de foco do diálogo implementados e validados em `tests/a11y-static.test.js`; teste com teclado/leitor de tela pendente de verificação manual)*
- [ ] Lembrete de backup: exibir data da última exportação do `canon.json`. *(lógica de 7 dias com alterações locais, banner dispensável e `requestPersistentStorageOnce` validados em `tests/backup.test.js`; eviction em navegador e confirmação visual pendentes de verificação manual)*
- [x] Mensagens de erro úteis para: sem chave, sem rede, CORS, cota atingida. *(catálogo central `js/ui/errors.js`, `js/ui/global-errors.js` e silêncio em cancelamentos validados em `tests/errors.test.js` e `tests/hygiene.test.js`)*

**Reservado:** polimento de micro-interações.

---

## Fase Final — Análise Preditiva, Auditoria de Segurança & Push

**Passos em ordem**
1. [x] `/error-detective`: varrer o projeto procurando erros de console, promessas sem `catch`, listeners sem remoção, vazamentos de `URL.createObjectURL`, divisão por zero em notas e caminhos absolutos que quebrem em `/canon/`. *(varredura executada, verificação de caixa exata em arquivos e ajustes em `main.js`, `sliders.js`, `form.js` e `ai-import.js`)*
2. [ ] Validar no navegador local o fluxo: abrir galeria, buscar obra, editar, salvar, virar card, exportar JSON, importar JSON, gerar PNG, gerar MP4 (ou degradar com aviso). *(pendente de verificação manual conforme `docs/VERIFICACAO_MANUAL.md`)*
3. [x] `node --test` verde. *(`npm.cmd test` 89/89 + `npm.cmd run smoke` validado em `/canon/` com 51 recursos HTTP 200)*
4. [x] `/auditar-seguranca`: nenhum segredo, nenhuma chave, nenhum `innerHTML` com dados externos sem sanitização. *(auditoria de código, `npm.cmd audit` 0 vulnerabilidades, teste de ausência de chaves em `canon.json` e `docs/SEGURANCA.md`)*
5. [x] `/publicar-portfolio`: README com descrição, como rodar, como publicar no GitHub Pages, créditos e atribuições; licença escolhida pelo usuário. *(`README.md`, `LICENSE`, `.nojekyll`, `covers/.gitkeep` e `docs/README_DOCS.md`)*
6. [x] `/pre-commit`: status, diff, testes, mensagem de commit clara.
7. [ ] Commit e push para `dyduq12/canon` (branch `main`), sem force push. Ativar GitHub Pages pela raiz fica como instrução ao usuário.
8. [ ] Entregar relatório final: o que foi feito, o que ficou reservado ao refinamento e riscos conhecidos.
BLOCO 2 — Prompt mestre para o Antigravity
Cole o texto abaixo. O agente deve substituir <CONTEÚDO DO BLOCO 1> pelo arquivo; como isso é cansativo, o prompt já manda ele pedir o conteúdo se não o tiver. A forma mais segura: salve o BLOCO 1 como FASES_CANON.md na pasta antes de colar o prompt.

text
Você é o engenheiro principal do projeto CANON, uma aplicação web estática 100% client-side (HTML, CSS e JavaScript puro com ES Modules), publicada em dyduq12.github.io/canon/. Trabalhe na pasta atual (CANON).

CONTEXTO
O CANON é uma câmara de curadoria pessoal para avaliar jogos, filmes, séries e animes, com cards estilo pôster editorial com flip 3D, 4 mascotes interativos (KOMA, SAVE, KINO, ECHO), áudio procedural (Web Audio), exportação de pôster PNG 1080x1350 e vídeo MP4 1080x1920 (~7 s) via Mediabunny. O refinamento final de tipografia, diagramação, texturas e arte SVG dos mascotes será feito depois por outra pessoa; seu trabalho é entregar um motor funcional e uma interface editorial limpa e funcional, com TODAS as cores, fontes e espaçamentos centralizados em css/tokens.css.

PASSO 0 — ARQUIVO-GUIA
1. Verifique se existe FASES_CANON.md na raiz. Se existir, leia-o por inteiro e trate-o como especificação obrigatória.
2. Se não existir, PARE e peça ao usuário para colar o conteúdo dele (não invente o roteiro).

REGRAS DE EXECUÇÃO
- Use /plan no início de CADA fase: descreva etapas, arquivos e riscos antes de escrever código.
- Use /goal para executar cada fase até os critérios de aceite do FASES_CANON.md estarem todos marcados [x], corrigindo erros no percurso.
- Use /javascript-pro para JavaScript e APIs do navegador; use /frontend-developer para layout responsivo e estado client-side.
- Registre decisões arquiteturais com /architecture-decision-records em docs/adr/.
- Use /debugger quando um critério falhar.
- NÃO use /swarm. Trabalhe de forma sequencial, uma fase por vez, e só avance quando a fase atual estiver validada.
- Após cada fase concluída, atualize as caixas [ ] do FASES_CANON.md para [x] e faça um resumo curto (3 a 6 linhas) do que foi feito.
- Antes de usar qualquer API de biblioteca (principalmente Mediabunny), consulte a documentação oficial atual (use Context7 ou a documentação do pacote instalado) e confirme as assinaturas. Não presuma nomes de métodos.

REGRAS INEGOCIÁVEIS
- ES Modules; sem variáveis globais além de window.CANON_DEBUG opcional.
- Caminhos relativos (o site roda em subpasta).
- Nunca desenhar imagem externa direto no canvas: baixe a capa, converta em Blob local e só então desenhe (evita tainted canvas). Envolva toBlob/getImageData em try/catch.
- Pointer Events: pointerup confirma; pointercancel e lostpointercapture cancelam. setPointerCapture no pointerdown. touch-action configurado.
- Altura com 100vh como fallback seguido de 100dvh; safe-area-inset; prefers-reduced-motion.
- Cache de APIs no IndexedDB com TTL; debounce e fila para a AniList (teto de ~30 req/min); em falha de CORS no RAWG, use cache e depois entrada manual.
- Mediabunny: rode a verificação canEncode antes de gravar; degrade 60->30 fps e sem áudio quando necessário; render determinístico frame a frame; áudio via OfflineAudioContext.
- Proibido #FFFFFF, #000000 e bege chapado: use apenas variáveis de tokens.css; mantenha o teste automatizado de cores.
- Chaves de API NUNCA vão ao repositório; ficam só no IndexedDB do usuário, digitadas numa tela de Configurações.
- Use um servidor estático local para testar (file:// não carrega módulos).
- Sem comentários excessivos no código; sem dependências de runtime além do Mediabunny (versão fixa em vendor/).

SEQUÊNCIA
Execute, na ordem do FASES_CANON.md: Fase 0, 1, 2, 3, 4, 5, 6, 7, 8 e Fase Final.

FASE FINAL (obrigatória, nesta ordem)
1. /error-detective: análise preditiva de bugs em todo o projeto; corrija o que encontrar.
2. Suba o servidor local, valide sintaxe e o fluxo completo no navegador (galeria, busca, edição, flip, exportar/importar JSON, PNG, MP4 ou degradação com aviso) e rode node --test.
3. /auditar-seguranca: procure segredos, chaves e uso inseguro de innerHTML; corrija.
4. /publicar-portfolio: prepare README, atribuições (RAWG com backlink, TMDB, AniList) e a estrutura para GitHub Pages.
5. /pre-commit: revise status, diff, testes e mensagem.
6. Faça commit e push para o repositório dyduq12/canon, branch main, SEM force push. Se o remoto não existir ou houver erro de autenticação, PARE e me diga exatamente o que fazer (não tente contornar).

RELATÓRIO FINAL
Entregue: lista do que foi implementado por fase, lista do que ficou reservado ao refinamento (tipografia, texturas, SVG dos mascotes, diagramação), problemas conhecidos e os comandos para rodar localmente.

Comece agora lendo o FASES_CANON.md e executando /plan da Fase 0.
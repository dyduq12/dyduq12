# Checklist Consolidado de Verificação Manual — CANON

Este documento reúne todos os critérios pendentes de navegador e dispositivo real das **Fases 1 a 8** do `FASES_CANON.MD`.
**Instruções:** Execute cada bloco com `npm.cmd run serve` acessível pela rede local ou porta local e registre suas anotações em `Observações`.

---

## (A) Desktop Chrome

- [ ] **Catálogo inicial sem dados locais (Fase 1):** Abrir em perfil/aba limpa `http://localhost:4173/canon/`. *Esperado:* as obras iniciais de `data/canon.json` aparecem na galeria e nenhum erro no Console (nem 404 de favicon).  
  Observações:
- [ ] **Persistência no IndexedDB e tombstones (Fase 1):** Adicionar, editar e remover uma obra (inclusive uma do catálogo público) e recarregar com `F5`. *Esperado:* alterações e exclusão persistem após recarregar.  
  Observações:
- [ ] **Exportar e Importar `canon.json` (Fase 1):** Clicar em "Exportar canon.json", depois importar arquivo válido e também tentar importar arquivo JSON inválido. *Esperado:* download gera arquivo versionado válido, importa com sucesso no válido e recusa com erro específico no inválido.  
  Observações:
- [ ] **Upload de capa WebP ~600×900, paleta e edição completa (Fase 2):** Buscar obra na API (AniList/TMDB/RAWG) e enviar capa local via upload; editar todos os campos retornados. *Esperado:* capa convertida para Blob local, paleta de 2 cores aplicada ao brilho do card e todos os campos permanecem editáveis.  
  Observações:
- [ ] **Temas e granulado SVG (Fase 3):** Alternar entre "Papel Fosco" e "Ardósia Noturna" e recarregar. *Esperado:* paleta alterna suavemente mantendo o granulado SVG sutil e preferência persistida no IndexedDB.  
  Observações:
- [ ] **Frente, verso e Flip 3D dos cards (Fase 3):** Virar um card por clique; verificar frente (capa, título em caixa alta, ano, ficha técnica) e verso (5 barras, prós, contras, status, veredito). *Esperado:* rotação 3D sem glitches de camada.  
  Observações:
- [ ] **Colar da IA + busca de metadados (Fase 4):** Clicar em "Copiar prompt padrão", colar JSON válido/inválido, revisar prévia e clicar em "Buscar metadados" (com e sem falha de API). *Esperado:* prévia exibida antes de salvar; falha de busca mantém todas as notas da IA intactas.  
  Observações:
- [ ] **Dock de mascotes, loop único e pausa em segundo plano (Fase 5):** Alternar para outra aba por alguns segundos e rolar o dock para fora da viewport. *Esperado:* loop `requestAnimationFrame` pausa quando oculto/fora da tela e reage ao abrir formulário/virar card.  
  Observações:
- [ ] **Pôster PNG 1080×1350 (Fase 6):** Abrir "Exportar pôster" em um card (incluindo um com URL externa bloqueada para testar placeholder), baixar PNG. *Esperado:* prévia fiel e arquivo PNG 1080×1350 baixado sem erro de tainted canvas.  
  Observações:
- [ ] **Vídeo MP4 1080×1920 via Mediabunny (Fase 7):** Na aba "Vídeo MP4", confirmar banner de aba aberta, gerar vídeo a 60 fps e outro cancelado no meio com "Cancelar". *Esperado:* vídeo NÃO gera antes de clicar; barra `<progress>` + ETA avançam suavemente, MP4 reproduz com áudio no player `<video>` e Cancelar interrompe imediatamente sem travar a memória.  
  Observações:
- [ ] **Lembrete de backup (> 7 dias / nunca exportado) e Persistência (Fase 8):** Com obras locais nunca exportadas (ou alterando `lastBackupAt` no DevTools para > 8 dias atrás), verificar exibição do banner dispensável e chamada progressiva a `navigator.storage.persist()` ao salvar a primeira obra. *Esperado:* banner aparece e pode ser dispensado; `persist()` executa uma vez sem erros mesmo se negado.  
  Observações:
- [ ] **Modo privado / bloqueio de IndexedDB (Fase 8):** Abrir em janela anônima com armazenamento restrito/simulado. *Esperado:* aviso explícito informa fallback em memória ("os dados serão perdidos ao fechar; exporte o canon.json").  
  Observações:

---

## (B) Chrome Android

- [ ] **Viewport estreito 360×640 e paisagem sem rolagem horizontal (Fases 3 e 8):** Rolar galeria, formulário, configurações, cabeçalho e cards (frente/verso) em 360 px de largura e em modo paisagem. *Esperado:* zero scroll horizontal (`scrollWidth <= clientWidth`), altura correta com `100dvh` e respeito a recortes `safe-area-inset-*`.  
  Observações:
- [ ] **Gestos de ponteiro R3 em sliders e flip (Fases 3 e 8):** Arrastar sliders de 0 a 10 (passo 0,5) e interromper arraste saindo para notificação/barra do sistema (`pointercancel`/`lostpointercapture`); rolar a lista tocando sobre cards e dock de mascotes. *Esperado:* cancelamento volta ao valor anterior sem confirmar; `pan-y` permite rolagem vertical sobre cards e canvas dos mascotes.  
  Observações:
- [ ] **Web Share nativo PNG e MP4 (Fases 6 e 7):** Clicar em "Compartilhar" no Estúdio (aba Pôster e aba Vídeo). *Esperado:* folha nativa do Android abre com o arquivo (`image/png` ou `video/mp4`) pronto para envio.  
  Observações:
- [ ] **Áudio Web Audio e vibração opcional (Fase 5):** Tocar em "Som: Silenciado" e interagir com sliders e salvar obra. *Esperado:* áudio desbloqueia no toque e `navigator.vibrate` dispara feedback tátil curto sem erros.  
  Observações:
- [ ] **Wake Lock e vídeo MP4 no celular (Fase 7):** Gerar vídeo MP4 no Android e observar tela e degradação `60 -> 30 fps` caso aplicável. *Esperado:* tela permanece acordada se suportado e áudio AAC/vídeo exportam sem falhas silenciosas.  
  Observações:

---

## (C) Safari iOS

> **Versão do iOS testada:** `___________` *(Importante: `AudioEncoder` WebCodecs nativo só existe a partir do **iOS 26+**; versões anteriores devem degradar automaticamente para MP4 sem áudio AAC com aviso claro).*

- [ ] **Desbloqueio de áudio Web Audio e estado `interrupted` no iOS (Fase 5):** Ativar botão "Som", alternar para outro app ou bloquear a tela e voltar ao Safari. *Esperado:* som inicia no gesto e retoma automaticamente ao voltar (`visibilitychange` / próximo toque).  
  Observações:
- [ ] **Copia do prompt IA via fallback manual iOS (Fase 4):** Testar "Copiar prompt padrão" no Safari. *Esperado:* se clipboard bloquear, textarea manual pré-selecionada abre facilitando a cópia.  
  Observações:
- [ ] **Pôster PNG, `navigator.share` síncrono e "Abrir imagem" no iOS (Fase 6):** Clicar em "Compartilhar" no Pôster PNG e testar também o link "Abrir imagem" com toque longo para "Salvar em Fotos". *Esperado:* folha de compartilhamento iOS abre sem erro `NotAllowedError` de expiração de gesto.  
  Observações:
- [ ] **Exportação MP4 no Safari iOS com degradação AAC / 30 fps (Fase 7):** Abrir aba "Vídeo MP4" e observar o estado da caixa "Incluir áudio". *Esperado:* em iOS anterior ao 26 (sem `AudioEncoder` AAC), a caixa desabilita automaticamente com aviso de "sem áudio"; no iOS 26+, gera MP4 com áudio AAC. Em ambos, nunca troca silenciosamente para Opus/MP3.  
  Observações:
- [ ] **Orientação paisagem, `100dvh`, `safe-area` e `eviction` do IndexedDB no Safari (Fase 8):** Testar modal Estúdio na horizontal em iPhone e verificar risco conhecido de limpeza automática de IndexedDB após ~7 dias sem uso caso `storage.persist()` não seja concedido pelo WebKit. *Esperado:* diálogo rola internamente sem cortar controles e banner de backup lembra o usuário após 7 dias.  
  Observações:

---

## (D) Acessibilidade e Teclado

- [ ] **Ordem lógica de Tab e `:focus-visible` (Fases 3 e 8):** Percorrer toda a aplicação apenas com `Tab` / `Shift+Tab`. *Esperado:* anel de foco visível em todos os links, botões, inputs, sliders e abas, em ordem visual coerente.  
  Observações:
- [ ] **Flip 3D por teclado e face oculta `inert` (Fases 3 e 8):** Ativar botão do card com `Enter` ou `Espaço` e pressionar `Tab` em seguida. *Esperado:* card gira, `aria-pressed` atualiza e o foco nunca entra na face oculta (`inert`/`aria-hidden="true"`).  
  Observações:
- [ ] **Sliders acessíveis via teclado (Fase 3):** Focar um slider (`role="slider"`) e usar `Setas`, `PageUp`, `PageDown`, `Home` e `End`. *Esperado:* nota ajusta em passos de 0,5 / 1,0 e leitor de tela anuncia `aria-valuenow` / `aria-valuetext`.  
  Observações:
- [ ] **Contenção de foco, abas e `Esc` no diálogo Estúdio (Fases 6, 7 e 8):** Abrir Estúdio, navegar com `Tab` até o último elemento (verificar ciclo de volta ao primeiro), usar `Setas` nas abas "Pôster PNG" / "Vídeo MP4" e fechar com `Esc`. *Esperado:* foco fica preso no modal e retorna ao botão "Exportar pôster" do card ao fechar.  
  Observações:
- [ ] **Preferência `prefers-reduced-motion` (Fases 5 e 8):** Ativar "Reduzir movimento" no SO/DevTools (`Emulate CSS prefers-reduced-motion: reduce`). *Esperado:* flip animado desliga, dock de mascotes para o loop contínuo mantendo desenho estático sob demanda e toda a aplicação continua utilizável.  
  Observações:
- [ ] **Ampliação de texto e Zoom 200% (Fase 8):** Aumentar tamanho da fonte no sistema/navegador e aplicar zoom de 200%. *Esperado:* textos escalam sem cortes nem sobreposição grave, mantendo funcionalidade completa.  
  Observações:

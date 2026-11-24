# Documentação do CANON (`docs/`)

Mapa rápido dos documentos operacionais, auditorias e registros de decisão do projeto:

- [`VERIFICACAO_MANUAL.md`](VERIFICACAO_MANUAL.md) — Checklist único consolidado das Fases 1 a 8 para validação manual em Desktop Chrome, Chrome Android, Safari iOS e teclado/acessibilidade.
- [`SEGURANCA.md`](SEGURANCA.md) — Relatório da auditoria de segurança (`/auditar-seguranca`), auditoria de dependências (`npm audit` e Mediabunny `1.66.4`), e proposta de Content-Security-Policy (não aplicada sem teste prévio em navegador).

## Architecture Decision Records (`docs/adr/`)

- [`0001-persistencia-hibrida.md`](adr/0001-persistencia-hibrida.md) — Catálogo público `data/canon.json` mesclado ao IndexedDB local com tombstones.
- [`0002-capas-same-origin.md`](adr/0002-capas-same-origin.md) — Conversão de capas remotas para Blob local (`covers` / `covers/`) evitando *tainted canvas* (Regra R2).
- [`0003-mediabunny-mp4.md`](adr/0003-mediabunny-mp4.md) — Escolha do Mediabunny em `vendor/` no lugar de `mp4-muxer` e `ffmpeg.wasm`.
- [`0004-chaves-api-indexeddb.md`](adr/0004-chaves-api-indexeddb.md) — Chaves de API do usuário armazenadas exclusivamente no IndexedDB (`meta`).
- [`0005-anilist-graphql.md`](adr/0005-anilist-graphql.md) — Adoção da AniList GraphQL API com fila de 30 req/min no lugar da Jikan.
- [`0006-exportacao-deterministica.md`](adr/0006-exportacao-deterministica.md) — Pipeline determinístico frame a frame e áudio offline via `OfflineAudioContext`.
- [`0007-mesclagem-tombstone-e-fallback-db.md`](adr/0007-mesclagem-tombstone-e-fallback-db.md) — Regras de tombstone e fallback transparente do IndexedDB em memória.
- [`0008-contratos-apis-camada-midia.md`](adr/0008-contratos-apis-camada-midia.md) — Contratos validados das APIs externas e quantização de paleta 32×32.
- [`0009-ui-tokens-flip-e-ponteiros.md`](adr/0009-ui-tokens-flip-e-ponteiros.md) — Centralização de tokens (`Papel Fosco` / `Ardósia Noturna`), flip 3D seguro e Pointer Events.
- [`0010-importacao-ia-parser-e-mesclagem.md`](adr/0010-importacao-ia-parser-e-mesclagem.md) — Parser resiliente de JSON da IA, prévia obrigatória e mesclagem conservadora.
- [`0011-motor-mascotes-audio-e-pausa.md`](adr/0011-motor-mascotes-audio-e-pausa.md) — Motor determinístico dos 4 mascotes (`dt = 1/60`), síntese Web Audio e pausa automática.
- [`0012-exportacao-poster-png-e-share-transiente.md`](adr/0012-exportacao-poster-png-e-share-transiente.md) — Exportação PNG 1080×1350, pré-renderização no Estúdio e `navigator.share` síncrono.
- [`0013-exportacao-video-mp4-mediabunny-e-timeline.md`](adr/0013-exportacao-video-mp4-mediabunny-e-timeline.md) — Timeline única 7 s, Mediabunny `1.66.4`, degradação 60→30 fps / sem AAC e `MessageChannel` yield.
- [`0014-blindagem-mobile-acessibilidade-e-erros.md`](adr/0014-blindagem-mobile-acessibilidade-e-erros.md) — Catálogo central de erros, captura global, contenção de foco, lembrete de backup e `storage.persist()`.

# ADR-0003: Adoção do Mediabunny em `vendor/` para exportação MP4

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

O CANON precisa exportar vídeos verticais MP4 (`1080x1920`, ~7 s) com vídeo H.264 e áudio AAC diretamente no navegador, utilizando WebCodecs no cliente e sem depender de serviços externos ou CDNs em runtime (Regra R1). Anteriormente, `mp4-muxer` era uma opção comum, porém foi depreciado em favor do seu sucessor oficial, **Mediabunny**.

## Opções Consideradas

- **Opção 1 — `mp4-muxer`:** biblioteca depreciada, sem manutenção ativa para novos fluxos de WebCodecs e áudio.
- **Opção 2 — `ffmpeg.wasm`:** binário WebAssembly muito pesado (~25–30 MB), alto consumo de memória em dispositivos móveis e frequentemente dependente de headers `COOP`/`COEP` para `SharedArrayBuffer` (incompatível com GitHub Pages padrão sem workarounds).
- **Opção 3 — Mediabunny empacotado em `vendor/`:** biblioteca leve, mantida pelo mesmo ecossistema sucessor do `mp4-muxer`, compatível com ES Modules e WebCodecs, sem exigir `SharedArrayBuffer`.

## Decisão

Adotar o **Mediabunny** no lugar de `mp4-muxer`:

- O pacote será instalado via `npm` em etapa dedicada (Fase 7) e seus artefatos ES Module necessários serão copiados/empacotados com **versão fixa** dentro de `vendor/mediabunny/` para serem servidos estaticamente pelo GitHub Pages, mantendo zero CDNs em runtime.
- Antes de iniciar qualquer gravação, a aplicação executará a verificação de suporte de codecs (`canEncode` / verificação equivalente da API oficial do Mediabunny) para H.264 e AAC.
- As assinaturas exatas da API serão conferidas na documentação oficial da versão instalada antes da implementação (Regra R6).

## Consequências

### Positivas
- Muxing MP4 moderno sem usar biblioteca depreciada (`mp4-muxer`) e sem o peso/restrições de `COOP`/`COEP` do `ffmpeg.wasm`.
- Versão travada em `vendor/` garante builds reprodutíveis e zero falhas por indisponibilidade de CDN externa.

### Negativas
- Depende de suporte a WebCodecs (`VideoEncoder`/`AudioEncoder`) no navegador do usuário para exportação acelerada.
- Exige atualização manual controlada em `vendor/` caso seja necessário atualizar a versão do Mediabunny no futuro.

### Riscos e Mitigações
- **Dispositivos sem suporte a H.264 60 fps ou AAC:** aplicar degradação progressiva (60→30 fps e fallback sem áudio com aviso ao usuário, conforme ADR-0006 e Regra R6).
- **Uso de assinaturas incorretas por mudança de API:** validar a documentação oficial do pacote instalado antes de codificar a Fase 7.

# ADR-0002: Estratégia de capas same-origin contra tainted canvas

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

O CANON extrai uma paleta de 2 cores dominantes de cada capa e renderiza pôsteres PNG (`1080x1350`) e vídeos MP4 (`1080x1920`) usando `<canvas>`. No navegador, desenhar uma `<img>` carregada diretamente de um domínio externo sem cabeçalhos CORS permissivos marca o canvas como contaminado (*tainted canvas*), fazendo com que `getImageData()`, `toBlob()` e a captura de frames lancem `SecurityError` e quebrem a exportação.

## Opções Consideradas

- **Opção 1 — Desenhar URL externa diretamente no `<canvas>` com `crossOrigin="anonymous"`:** falha sempre que o servidor de origem não envia `Access-Control-Allow-Origin` adequado ou muda políticas de cache/CORS.
- **Opção 2 — Proxy backend para imagens:** viola a arquitetura 100% client-side e estática do projeto no GitHub Pages.
- **Opção 3 — Conversão antecipada para Blob WebP local (same-origin) ao salvar:** baixa e normaliza a imagem uma única vez no momento do salvamento, isolando falhas de CORS.

## Decisão

Adotar a estratégia de **capas same-origin (Regra R2)**:

- Toda capa externa é baixada via `fetch` ao **salvar** a obra e convertida localmente para um **Blob WebP** redimensionado (~`600x900`), salvo no IndexedDB ou referenciado em `covers/` (same-origin).
- O `<canvas>` de pôster, vídeo e extração de paleta **nunca** desenha URLs externas diretamente — apenas Blobs locais ou arquivos em `covers/`.
- Se o `fetch` da capa externa falhar (por CORS ou rede), a interface orienta o usuário e cai graciosamente para **upload manual** de arquivo local ou **capa placeholder**, sem nunca quebrar a exportação.
- A paleta de 2 cores é calculada uma única vez ao salvar (quantização em ~`32x32`) e gravada no registro da obra.
- Toda chamada a `toBlob()` e `getImageData()` deve ficar protegida por `try/catch` com mensagem clara de erro na interface.

## Consequências

### Positivas
- Elimina falhas inesperadas de *tainted canvas* durante a geração de pôsteres PNG e vídeos MP4.
- Reduz uso de memória e largura de banda ao padronizar capas em WebP ~`600x900` e armazenar a paleta pré-calculada.
- Garante funcionamento offline após o salvamento da obra.

### Negativas
- Aumenta o custo computacional no momento de salvar a obra (decode + resize + encode WebP + quantização).
- Algumas URLs externas podem exigir upload manual pelo usuário quando bloqueadas por CORS.

### Riscos e Mitigações
- **Vazamento de `ObjectURL`:** gerenciar ciclo de vida de `URL.createObjectURL` e revogar URLs temporárias após uso.
- **Navegadores sem suporte ou falha de memória em `toBlob`:** encapsular em `try/catch` com feedback explícito ao usuário.

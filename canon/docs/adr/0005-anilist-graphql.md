# ADR-0005: AniList GraphQL API no lugar da Jikan API

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

Para buscar metadados de animes (título, capa, ano, estúdio e equipe/staff) diretamente do navegador sem precisar de chave de API nem proxy backend, precisamos de uma fonte pública estável e com suporte a CORS. A antiga **Jikan API** (especialmente versões públicas descontinuadas/instáveis e limites restritos de infraestrutura legada) não oferece a mesma confiabilidade e modelagem direta de campos que o projeto necessita.

## Opções Consideradas

- **Opção 1 — Jikan API:** histórico de descontinuação de endpoints antigos, resposta REST com múltiplos chamados para obter estúdio/staff completos e maior instabilidade sob carga pública.
- **Opção 2 — AniList GraphQL API:** endpoint único via `POST` (`https://graphql.anilist.co`), sem necessidade de chave para leitura pública, com suporte a CORS e seleção exata de campos em uma única consulta.

## Decisão

Adotar a **AniList GraphQL API** para busca de animes (Regra R5):

- Consultas realizadas via `POST` em GraphQL sem chave de API, solicitando apenas os campos necessários (título, imagem de capa, ano, estúdio e staff).
- Aplicar **debounce de 400–600 ms** na digitação da busca.
- Enfileirar requisições respeitando o **teto atual divulgado de 30 requisições por minuto**, tratando respostas **HTTP 429** com espera controlada (*backoff* / `Retry-After`).
- Armazenar resultados em **cache no IndexedDB** com TTL e chave no formato `provider:query` para evitar chamadas repetidas.

## Consequências

### Positivas
- Uma única consulta GraphQL traz título, capa, ano, estúdio e staff sem *over-fetching* nem múltiplas rodadas HTTP.
- Não exige chave de API do usuário para buscar animes.
- Controle explícito de fila e cache reduz drasticamente erros de rate limit.

### Negativas
- Exige controle de fila no cliente para respeitar o teto de 30 req/min e lidar com eventuais janelas de HTTP 429.
- A disponibilidade depende de serviço externo de terceiros.

### Riscos e Mitigações
- **Rate limit (HTTP 429) ou indisponibilidade temporária:** cache persistente no IndexedDB atende buscas repetidas sem rede, e falhas mantêm a entrada manual disponível sem travar o formulário.

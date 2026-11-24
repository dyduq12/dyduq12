# ADR-0008: Contratos confirmados das APIs externas e pipeline de capas/paleta

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

Antes de implementar a Fase 2 (busca de metadados, cache e normalização de capas), foi necessário confirmar na documentação oficial os endpoints, parâmetros de autenticação e nomes exatos de campos da **AniList**, **TMDB v3** e **RAWG**, além de definir os contratos de resiliência para CORS, rate limit e codecs de canvas.

## Contratos Confirmados nas Documentações Oficiais

1. **AniList GraphQL API (`POST https://graphql.anilist.co`):**
   - Sem necessidade de chave de API para consultas públicas.
   - Consulta paginada via `Page(page: $page, perPage: $perPage) { media(search: $search, type: ANIME, sort: POPULARITY_DESC) { ... } }`.
   - Campos confirmados no tipo `Media`:
     - `id`
     - `title { romaji english native userPreferred }`
     - `coverImage { extraLarge large medium }`
     - `seasonYear` e `startDate { year }`
     - `genres`
     - `studios { edges { isMain node { name } } }`
     - `staff(perPage: 10) { edges { role node { name { full } } } }`
2. **TMDB API v3 (`https://api.themoviedb.org/3`):**
   - Autenticação v3 por query parameter `api_key=<chave>`.
   - Busca de filmes: `GET /search/movie` (`id`, `title`, `release_date`, `poster_path`).
   - Busca de séries: `GET /search/tv` (`id`, `name`, `first_air_date`, `poster_path`).
   - Detalhes e créditos: `GET /movie/{id}?append_to_response=credits` e `GET /tv/{id}?append_to_response=credits` (também disponível em `/movie/{id}/credits` e `/tv/{id}/credits`), utilizando `credits.crew` (`job === "Director"` / música), `credits.cast` (elenco principal), `genres`, `production_companies` e `created_by` (para séries).
   - URL base segura das imagens: `https://image.tmdb.org/t/p/w500` + `poster_path`.
3. **RAWG Video Games Database API (`https://api.rawg.io/api`):**
   - Autenticação obrigatória pelo query parameter `key=<chave>`.
   - Busca de jogos: `GET /games?key=...&search=...` (`id`, `name`, `released`, `background_image`, `genres[]`).
   - Detalhes do jogo: `GET /games/{id}?key=...` (`developers[]`, `genres[]`, `released`, `background_image`).

## Decisões Arquiteturais da Camada

1. **Erros tipados em `http.js`:** distinguir claramente falha de rede/CORS (`TypeError` do `fetch` → `network`), timeout (`timeout`), cancelamento (`aborted`), autenticação (`401`/`403` → `auth`), `404` (`not_found`), `429` (`rate_limit` com leitura de `Retry-After`) e `5xx` (`server`).
2. **Cache e resiliência:** TTL padrão de 24h para AniList/TMDB e cache agressivo (7 dias) para RAWG. Se a RAWG falhar por `TypeError` (CORS/rede), devolver cache existente (mesmo expirado) ou erro tipado `NETWORK_BLOCKED` para entrada manual sem travar a interface.
3. **Pipeline de capa (`cover.js`) e paleta pura (`palette.js`):**
   - Quantização pura separada em `palette.js` para permitir testes determinísticos em Node sem DOM.
   - Em `cover.js`, tentar codificar o canvas `~600x900` em `image/webp` e validar `blob.type` resultante; caso o navegador retorne `image/jpeg` ou `image/png`, aceitar sem falhar.

## Consequências

- Todos os adaptadores usam contratos verificados e retornam objetos normalizados compatíveis com `js/core/schema.js`.
- Testes automatizados em Node validam adaptadores, fila da AniList, cache com TTL e quantização de paleta com `fetch` e relógios injetáveis, sem chamadas reais de rede.

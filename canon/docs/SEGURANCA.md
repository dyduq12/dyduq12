# Auditoria de Segurança e Política CSP — CANON

## 1. Resumo da Auditoria Estática (`/auditar-seguranca`)

- **Segredos e chaves de API:** nenhuma chave, token ou senha está presente no código-fonte, em `data/canon.json` ou em `docs/`. As chaves do usuário (TMDB v3 e RAWG) residem exclusivamente no object store `meta` do IndexedDB do navegador (`API_KEYS_META_KEY = 'apiKeys'`) e não são incluídas no payload de `store.exportCanonJson()`.
- **Arquivos locais e histórico:** `.env`, `.env.*`, `node_modules/`, arquivos de sistema e `.agents/` estão bloqueados no `.gitignore`. Nenhuma referência a diretórios pessoais ou caminhos locais do sistema existe nos arquivos versionados.
- **Contato público do autor em `LICENSE`:** o arquivo `LICENSE` escolhido pelo autor contém dados de contato comercial intencionais escolhidos pelo titular do copyright. Nenhuma credencial privada ou e-mail pessoal não intencional foi mantida em código ou documentação técnica.
- **Execução dinâmica e XSS:**
  - Zero ocorrências de `innerHTML`, `eval`, `new Function`, `document.write` ou `localStorage` no código de runtime (`js/`).
  - Toda entrada externa (parser "Colar da IA", importação de `canon.json`, respostas de AniList/TMDB/RAWG) é validada contra o schema ou inserida apenas via `textContent` / `value`.
  - Todos os links externos com `target="_blank"` usam `rel="noopener noreferrer"`.
- **Proteção contra *Tainted Canvas* (R2):** capas externas são baixadas apenas para conversão local (WebP/JPEG/PNG no store `covers` ou arquivos locais `covers/`), nunca desenhadas diretamente de origens externas em `<canvas>` de paleta, pôster ou vídeo.

## 2. Auditoria de Dependências (`/dependency-management-deps-audit`)

- **`npm audit`:** `0` vulnerabilidades (`critical: 0`, `high: 0`, `moderate: 0`, `low: 0`, `info: 0`).
- **Dependência única de runtime (vendorizada):** `mediabunny@1.66.4` (`MPL-2.0`), instalada com `--save-exact` em `devDependencies` do `package.json`, com bundle ESM (`vendor/mediabunny/mediabunny.min.mjs`) e `LICENSE` preservados em versão idêntica à registrada em `vendor/mediabunny/version.json`.

## 3. Content-Security-Policy (CSP) Proposta — NÃO Aplicada

A política abaixo fica registrada apenas como proposta documentada e **não foi aplicada** no `index.html`, pois não pôde ser validada em navegador real nesta etapa e exige verificação prévia para não quebrar exportação de vídeo, estilos ou workers.

```text
default-src 'self';
script-src 'self';
style-src 'self';
connect-src 'self' https://graphql.anilist.co https://api.themoviedb.org https://api.rawg.io;
img-src 'self' blob: data:;
media-src 'self' blob: data:;
font-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

### Observações e pontos a validar antes de ativar a CSP
1. **`connect-src` adicional para capas:** baixar capas remotas (R2) via `fetch(..., { mode: 'cors' })` exige liberar também as origens CDN de imagens usadas pelas APIs (`https://s4.anilist.co`, `https://image.tmdb.org`, `https://media.rawg.io`) — sem isso, `fetchAndStoreCover` cairá para o fallback de upload manual.
2. **Estilos inline / textura SVG:** `--grain-svg` em `css/tokens.css` usa `url("data:image/svg+xml,...")` dentro de CSS (`style-src`/`img-src 'self' data:`), mas alguns manipuladores alteram `element.style.*` diretamente (`card.js`, `sliders.js`); verificar em console do Chrome/Safari se nenhum atributo `style` viola `style-src 'self'`.
3. **Mediabunny e Workers:** confirmar se `mediabunny@1.66.4` ou encoders WebCodecs criam `Blob` Workers ou `blob:` URLs em algum navegador (`worker-src 'self' blob:`).
4. **Limitação do GitHub Pages:** GitHub Pages não permite configurar cabeçalhos HTTP de resposta customizados; portanto, caso adotada futuramente, a CSP deve ser aplicada via `<meta http-equiv="Content-Security-Policy" ...>` (observando que `frame-ancestors` é ignorado em `<meta>`).

# ADR-0004: Chaves de API exclusivamente no IndexedDB do usuário

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

O CANON integra APIs de metadados como **TMDB** (filmes e séries) e **RAWG** (jogos), ambas exigindo chaves de API (*API keys*), além da **AniList** (que não exige chave para consultas públicas). Como o código-fonte é público no GitHub e servido estaticamente em `dyduq12.github.io/dyduq12/canon/`, qualquer chave incluída no repositório, em arquivos JS ou em variáveis de build ficaria exposta publicamente e sujeita a abuso ou revogação.

## Opções Consideradas

- **Opção 1 — Embutir chaves no frontend ou em build estático:** expõe credenciais no repositório e no bundle entregue ao navegador.
- **Opção 2 — Criar proxy backend para guardar segredos:** quebra a restrição arquitetural de aplicação 100% client-side e estática sem servidor próprio.
- **Opção 3 — Armazenamento local das chaves do usuário no IndexedDB:** cada usuário informa suas próprias chaves na tela de Configurações, mantidas localmente no navegador.

## Decisão

Determinar que **nenhuma chave de API ou segredo pode existir no repositório** (Regra R7):

- As chaves de TMDB e RAWG são informadas pelo próprio usuário em uma tela de **Configurações** e gravadas exclusivamente no **IndexedDB** local.
- Quando não houver chave configurada para determinado provedor, a interface explica claramente como configurar e mantém o fluxo de **entrada manual** plenamente funcional.
- O rodapé da aplicação exibirá as atribuições obrigatórias dos provedores: **RAWG** (com backlink), **TMDB** e **AniList** (texto e link).

## Consequências

### Positivas
- Elimina risco de vazamento de credenciais no Git ou no código publicado no GitHub Pages.
- Preserva a arquitetura 100% estática e sem custos de servidor.
- Permite uso imediato da aplicação via entrada manual ou AniList mesmo sem nenhuma chave configurada.

### Negativas
- Exige que o usuário crie e insira suas próprias chaves de TMDB/RAWG para busca automática nesses provedores.

### Riscos e Mitigações
- **Commit acidental de arquivo `.env` ou segredo de teste:** `.gitignore` bloqueia `.env*` e a Fase Final inclui auditoria de segurança (`/auditar-seguranca`).
- **Exposição via XSS ou scripts de terceiros:** manter zero dependências de CDN em runtime e sanitizar dados externos antes de renderizar no DOM (sem `innerHTML` inseguro).

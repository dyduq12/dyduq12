# ADR-0001: Persistência híbrida (`canon.json` + IndexedDB)

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

O CANON é uma aplicação web estática 100% client-side hospedada no GitHub Pages (`dyduq12.github.io/dyduq12/canon/`), sem servidor backend ou banco de dados remoto. Precisamos atender simultaneamente a dois cenários:

1. **Visitante em modo somente leitura:** abre a URL pública e visualiza imediatamente a curadoria publicada pelo autor sem precisar configurar nada.
2. **Curador/usuário editando no navegador:** adiciona, edita, remove obras, salva capas locais em Blob WebP e armazena cache de APIs e chaves pessoais, mantendo os dados após recarregar a página.

## Opções Consideradas

- **Opção 1 — Somente `canon.json` estático:** simples para leitura, mas impede edições locais no navegador sem commit manual no repositório.
- **Opção 2 — Somente `localStorage`:** limite pequeno (~5 MB), síncrono e inadequado para Blobs de imagens binárias e cache estruturado.
- **Opção 3 — Persistência híbrida (`data/canon.json` + IndexedDB):** combina catálogo inicial versionado no repositório com armazenamento assíncrono local para edições, Blobs e cache.

## Decisão

Adotar **persistência híbrida** combinando `data/canon.json` e **IndexedDB**:

- Na inicialização, a aplicação carrega `data/canon.json` (via caminho relativo) e mescla com os registros gravados no IndexedDB.
- Registros locais no IndexedDB com o mesmo `id` (`provider:id` ou `manual:uuid`) sobrepõem os registros correspondentes de `data/canon.json`.
- Tanto `canon.json` quanto os registros individuais carregam `schemaVersion` para evolução segura do modelo.
- O usuário pode **exportar** um novo `canon.json` versionado (para atualizar o repositório ou fazer backup) e **importar** um `canon.json` validado pelo schema.

## Consequências

### Positivas
- Visitantes veem o acervo imediatamente sem login nem backend.
- Edições no navegador persistem entre sessões e suportam Blobs binários (capas WebP) sem estourar a cota de `localStorage`.
- Portabilidade total via exportação/importação de `canon.json`.

### Negativas
- Exige lógica explícita de mesclagem entre catálogo estático e estado local (incluindo controle de remoção/sobreposição de itens padrão).
- Dados locais no IndexedDB ficam restritos ao navegador/dispositivo do usuário até que ele exporte o `canon.json`.

### Riscos e Mitigações
- **Perda de dados por limpeza do navegador:** exibir lembrete de backup com a data da última exportação do `canon.json` (previsto na Fase 8).
- **Mudança de formato ao longo das fases:** validar importações e leituras com `schemaVersion` e testes automatizados em `tests/schema.test.js`.

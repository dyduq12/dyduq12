# ADR-0007: Mesclagem com tombstone e fallback em memória do IndexedDB

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

Na implementação da Fase 1 (núcleo de persistência híbrida descrita no ADR-0001), surgiram dois problemas práticos de borda que precisam de comportamento explícito e determinístico:

1. **Remoção de obras vindas do `data/canon.json`:** como `data/canon.json` é estático e recarregado a cada inicialização, simplesmente apagar um registro local no IndexedDB faria uma obra pública removida pelo usuário reaparecer ao recarregar a página.
2. **Indisponibilidade do IndexedDB:** navegadores em modo privado restrito, políticas de cookies bloqueadas ou falhas de cota podem impedir `indexedDB.open()`, o que quebraria a aplicação antes mesmo de exibir o catálogo público.

## Opções Consideradas

- **Opção 1 — Ignorar remoção de obras públicas / falhar quando IndexedDB estiver indisponível:** degrada a experiência do usuário e contradiz a tolerância a falhas do projeto.
- **Opção 2 — Guardar uma cópia inteira do `canon.json` no IndexedDB na primeira visita:** impede que atualizações futuras em `data/canon.json` cheguem para usuários recorrentes.
- **Opção 3 — Tombstones leves para exclusões + fallback transparente em memória no `db.js`:** mantém mesclagem dinâmica com `data/canon.json` e garante funcionamento contínuo mesmo sem IndexedDB persistente.

## Decisão

1. **Mesclagem com *tombstone* (`mergeWorks` em `js/core/schema.js`):**
   - Obras de `data/canon.json` recebem `source: 'public'` em runtime quando não possuem entrada local.
   - Registros locais no IndexedDB com o mesmo `id` sobrepõem o item público e recebem `source: 'local'`.
   - Ao remover uma obra pública, o `store.js` grava um registro leve `{ id, deleted: true, schemaVersion, updatedAt }` na store `works` do IndexedDB, ocultando o item na mesclagem sem alterar o `data/canon.json` estático.
   - Exportações (`exportCanonJson`) omitem registros marcados com `deleted: true` e metadados de runtime (`source`).
2. **Fallback em memória (`js/core/db.js`):**
   - Se `indexedDB` não existir ou `indexedDB.open()` lançar erro (`SecurityError`, `InvalidStateError`, `QuotaExceededError`, `onblocked`), o wrapper ativa automaticamente armazenamento em `Map` em memória para as 4 stores (`works`, `covers`, `apiCache`, `meta`), registra `warn` estruturado e expõe o aviso para exibição clara na interface.

## Consequências

### Positivas
- Exclusões e edições de itens do catálogo público persistem corretamente sem bloquear futuras atualizações de `data/canon.json`.
- A aplicação continua utilizável (leitura, edição temporária e exportação de `canon.json`) mesmo com IndexedDB bloqueado.
- A lógica pura de mesclagem (`mergeWorks`) pode ser testada integralmente em `node --test`.

### Negativas
- No modo fallback em memória, alterações locais não sobrevivem ao recarregamento da aba (por isso a UI exibe aviso explícito e recomenda exportação de `canon.json`).

### Riscos e Mitigações
- **Acúmulo de tombstones antigos após muitas exclusões:** registros tombstone contêm apenas 4 campos mínimos e são limpos automaticamente ao importar um novo `canon.json`.

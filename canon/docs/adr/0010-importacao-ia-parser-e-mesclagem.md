# ADR-0010: Importação "Colar da IA" — Formato, Tolerâncias do Parser e Mesclagem

**Status:** Accepted  
**Data:** 2026-11-24

## Contexto

Na Fase 4, o usuário descreve impressões livres para uma IA externa, recebe um bloco JSON padronizado e cola no CANON para revisão e enriquecimento via APIs antes de salvar manualmente. Textos colados de chats de IA frequentemente contêm texto introdutório, aspas tipográficas, vírgulas finais ou notas em formato textual com vírgula decimal (`"8,5"`), exigindo tolerância controlada sem comprometer segurança nem integridade do schema.

## Decisões

1. **Prompt sincronizado com o schema (`js/ai/prompt-template.js`):**
   - Gerado dinamicamente a partir de `WORK_TYPES`, `WORK_STATUSES` e `SCORE_KEYS` de `js/core/schema.js`.
   - Instrui a IA a responder com um único bloco ```json, sem inventar dados factuais incertos, acompanhado de um exemplo completo validado por teste de ida e volta.
2. **Parser puro, seguro e tolerante (`js/ai/parser.js`):**
   - **Extração:** prioriza o primeiro bloco cercado (` ```json ` ou ` ``` `) e, na ausência, extrai o primeiro objeto `{ ... }` balanceado; múltiplos blocos geram aviso.
   - **Limites:** máximo de `20.000` caracteres de entrada (acima disso bloqueia); máximo de `8` prós e `8` contras; itens truncados em `160` caracteres e `verdict` em `400` caracteres com aviso.
   - **Tolerâncias com aviso explícito:** remoção de BOM/caracteres de controle, substituição de aspas tipográficas por aspas retas, remoção de vírgulas finais antes de `}`/`]`, conversão de notas string com vírgula (`"8,5"`), arredondamento para o passo `0,5` mais próximo e descarte de chaves desconhecidas.
   - **Segurança:** usa apenas `JSON.parse` e constrói o objeto por lista branca de campos permitidos, bloqueando `__proto__`, `constructor` e `prototype`. Toda saída passa por `validateWork`.
3. **Regra de mesclagem (`js/ai/import-merge.js`):**
   - Dados fornecidos pela IA/usuário **nunca** são sobrescritos pela API.
   - A API preenche exclusivamente campos vazios (incluindo `year` quando marcado como omitido no bloco original da IA) e promove `id` para `provider:id` quando um resultado é selecionado; caso contrário, mantém `manual:<uuid>`.
4. **Fluxo na UI (`js/ui/ai-import.js`):**
   - Exibe prévia somente leitura com `card.js` (`readOnly: true`) e origem dos campos.
   - Falhas de busca, ausência de chave ou bloqueio CORS na capa nunca descartam as notas nem salvam automaticamente; apenas pré-preenchem o formulário principal para revisão final.

## Consequências

- Isolamento completo da lógica de parsing e mesclagem em módulos puros testáveis em Node.
- Resiliência contra variações comuns de formatação de LLMs mantendo validação estrita do schema.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAiImport } from '../js/ai/parser.js';
import { buildAiPromptTemplate, getAiPromptTemplate } from '../js/ai/prompt-template.js';
import {
  CRITERIA_KEYS,
  LEGACY_SCORE_KEYS,
  WORK_STATUSES,
  WORK_TYPES,
  computeGeral,
  validateWork
} from '../js/core/schema.js';

function extractExample(prompt) {
  const match = prompt.match(/```json\s*([\s\S]*?)```/);
  assert.ok(match, 'Prompt deve conter um bloco ```json de exemplo');
  return { block: match[0], data: JSON.parse(match[1]) };
}

describe('prompt-template.js — sincronia com schema e teste de ida e volta', () => {
  it('inclui todos os tipos, status e nomes exatos dos 4 critérios ativos do schema.js', () => {
    const prompt = buildAiPromptTemplate();

    for (const type of WORK_TYPES) {
      assert.ok(prompt.includes(type), `Prompt deve incluir tipo "${type}"`);
    }
    for (const status of WORK_STATUSES) {
      assert.ok(prompt.includes(status), `Prompt deve incluir status "${status}"`);
    }
    for (const key of CRITERIA_KEYS) {
      assert.ok(prompt.includes(key), `Prompt deve incluir critério "${key}"`);
    }
    assert.ok(prompt.includes(`EXATAMENTE as ${CRITERIA_KEYS.length} chaves`));
    assert.ok(/0,5/.test(prompt) && /entre 0 e 10/.test(prompt));
    for (const label of ['História', 'Gameplay/Ritmo', 'Gráficos/Fotografia', 'Trilha Sonora']) {
      assert.ok(prompt.includes(label), `Prompt deve nomear o critério "${label}"`);
    }
  });

  it('exige apenas os 4 critérios no exemplo e não solicita geral nem direcao_arte', () => {
    const prompt = buildAiPromptTemplate();
    const { data } = extractExample(prompt);

    assert.deepEqual(Object.keys(data.scores), [...CRITERIA_KEYS]);
    assert.equal('geral' in data.scores, false);
    for (const legacyKey of LEGACY_SCORE_KEYS) {
      assert.equal(prompt.includes(legacyKey), false, `Prompt não deve citar "${legacyKey}"`);
      assert.equal(legacyKey in data.scores, false);
    }
    assert.equal(prompt.includes('"geral"'), false);
    assert.equal(/Dire[çc][ãa]o de Arte/i.test(prompt), false);

    assert.ok(prompt.includes('Nota Geral'));
    assert.ok(/calculada automaticamente/i.test(prompt));
    assert.ok(/média aritmética/i.test(prompt));
    assert.ok(/NÃO envie nota geral/.test(prompt));
  });

  it('orienta prós e contras curtos, com no máximo 6 itens por lista', () => {
    const prompt = buildAiPromptTemplate();
    const { data } = extractExample(prompt);

    assert.ok(prompt.includes('NO MÁXIMO 6 itens por lista'));
    assert.ok(/tags curtas e objetivas/.test(prompt));
    assert.ok(/verso do card/.test(prompt));

    for (const list of [data.pros, data.cons]) {
      assert.ok(list.length >= 1 && list.length <= 6);
      for (const item of list) {
        assert.ok(item.length <= 40, `Item de exemplo muito longo: "${item}"`);
      }
    }
  });

  it('exemplo embutido no prompt passa pelo parser com ok=true e zero erros (ida e volta)', () => {
    const prompt = buildAiPromptTemplate();
    const { block } = extractExample(prompt);

    const roundTrip = parseAiImport(block);
    assert.equal(roundTrip.ok, true, JSON.stringify(roundTrip.errors));
    assert.deepEqual(roundTrip.errors, []);
    assert.deepEqual(roundTrip.warnings, []);
    assert.equal(validateWork(roundTrip.work).valid, true);
    assert.equal(roundTrip.work.scores.geral, computeGeral(roundTrip.work.scores));
    assert.equal(roundTrip.work.scores.geral, 9.375);
    assert.equal('direcao_arte' in roundTrip.work.scores, false);

    const fullPromptRoundTrip = parseAiImport(prompt);
    assert.equal(fullPromptRoundTrip.ok, true, JSON.stringify(fullPromptRoundTrip.errors));
    assert.deepEqual(fullPromptRoundTrip.errors, []);
    assert.deepEqual(fullPromptRoundTrip.warnings, []);
  });

  it('getAiPromptTemplate é um alias de buildAiPromptTemplate', () => {
    assert.equal(getAiPromptTemplate, buildAiPromptTemplate);
    assert.equal(getAiPromptTemplate(), buildAiPromptTemplate());
  });
});

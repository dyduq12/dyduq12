import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAiImport } from '../js/ai/parser.js';
import { buildAiPromptTemplate } from '../js/ai/prompt-template.js';
import { SCORE_KEYS, WORK_STATUSES, WORK_TYPES, validateWork } from '../js/core/schema.js';

describe('prompt-template.js — sincronia com schema e teste de ida e volta', () => {
  it('inclui todos os tipos, status e nomes exatos de scores do schema.js', () => {
    const prompt = buildAiPromptTemplate();

    for (const type of WORK_TYPES) {
      assert.ok(prompt.includes(type), `Prompt deve incluir tipo "${type}"`);
    }
    for (const status of WORK_STATUSES) {
      assert.ok(prompt.includes(status), `Prompt deve incluir status "${status}"`);
    }
    for (const key of SCORE_KEYS) {
      assert.ok(prompt.includes(key), `Prompt deve incluir critério "${key}"`);
    }
  });

  it('exemplo embutido no prompt passa pelo parser com ok=true e zero erros (ida e volta)', () => {
    const prompt = buildAiPromptTemplate();
    const match = prompt.match(/```json\s*([\s\S]*?)```/);
    assert.ok(match, 'Prompt deve conter um bloco ```json de exemplo');

    const roundTrip = parseAiImport(match[0]);
    assert.equal(roundTrip.ok, true, JSON.stringify(roundTrip.errors));
    assert.deepEqual(roundTrip.errors, []);
    assert.deepEqual(roundTrip.warnings, []);
    assert.equal(validateWork(roundTrip.work).valid, true);

    const fullPromptRoundTrip = parseAiImport(prompt);
    assert.equal(fullPromptRoundTrip.ok, true, JSON.stringify(fullPromptRoundTrip.errors));
    assert.deepEqual(fullPromptRoundTrip.errors, []);
    assert.deepEqual(fullPromptRoundTrip.warnings, []);
  });
});

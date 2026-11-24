import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_INPUT_CHARS, parseAiImport } from '../js/ai/parser.js';
import { isValidWorkId, validateWork } from '../js/core/schema.js';

function makeValidRawObj(overrides = {}) {
  return {
    type: 'game',
    title: 'Hollow Knight',
    year: 2017,
    genre: 'Metroidvania',
    studio: 'Team Cherry',
    director: '',
    soundtrack: 'Christopher Larkin',
    starring: '',
    scores: {
      geral: 9.5,
      historia: 8.5,
      gameplay_ritmo: 9.5,
      graficos_fotografia: 9.0,
      trilha: 9.5,
      direcao_arte: 10
    },
    pros: ['Combate preciso', 'Exploração interconectada'],
    cons: ['Backtracking longo no início'],
    status: 'completed',
    verdict: 'Referência moderna de metroidvania.',
    ...overrides
  };
}

describe('parser.js — extração, tolerâncias, segurança e validação', () => {
  it('extrai bloco cercado no meio de texto livre e valida via validateWork', () => {
    const raw = [
      'Aqui está a análise solicitada:',
      '```json',
      JSON.stringify(makeValidRawObj(), null, 2),
      '```',
      'Espero que ajude!'
    ].join('\n');

    const res = parseAiImport(raw);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.equal(res.errors.length, 0);
    assert.equal(res.warnings.length, 0);
    assert.equal(isValidWorkId(res.work.id), true);
    assert.ok(res.work.id.startsWith('manual:'));
    assert.equal(validateWork(res.work).valid, true);
  });

  it('extrai JSON solto começando em { e avisa quando há múltiplos blocos', () => {
    const obj = makeValidRawObj({ title: 'JSON Solto' });
    const loose = `Texto antes ${JSON.stringify(obj)} texto depois`;
    const resLoose = parseAiImport(loose);
    assert.equal(resLoose.ok, true);
    assert.equal(resLoose.work.title, 'JSON Solto');

    const multi = `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
    const resMulti = parseAiImport(multi);
    assert.equal(resMulti.ok, true);
    assert.ok(resMulti.warnings.some((w) => /Múltiplos blocos/i.test(w)));
  });

  it('retorna erro específico quando não há bloco JSON ou quando JSON é inválido', () => {
    const noBlock = parseAiImport('Apenas texto sem nenhum JSON aqui.');
    assert.equal(noBlock.ok, false);
    assert.ok(noBlock.errors.some((e) => e.field === 'json' && /nenhum bloco/i.test(e.message)));

    const badJson = parseAiImport('```json\n{"type": "game", "title": }\n```');
    assert.equal(badJson.ok, false);
    assert.ok(badJson.errors.some((e) => e.field === 'json' && /posição/i.test(e.message)));
  });

  it('tolera com aviso: vírgula sobrando, aspas tipográficas, BOM/controle, "8,5" e arredondamento 7.3 -> 7.5', () => {
    const messy =
      '\uFEFF```json\n' +
      '{\n' +
      '  “type”: “movie”,\n' +
      '  “title”: “Obra Tolerante”,\n' +
      '  “scores”: {\n' +
      '    “geral”: “8,5”,\n' +
      '    “historia”: 7.3,\n' +
      '    “gameplay_ritmo”: 8,\n' +
      '    “graficos_fotografia”: 9,\n' +
      '    “trilha”: 8.5,\n' +
      '    “direcao_arte”: 8,\n' +
      '  },\n' +
      '  “pros”: [“Ótima fotografia”,],\n' +
      '  “cons”: [],\n' +
      '  “status”: “completed”,\n' +
      '  “verdict”: “Muito bom.”,\n' +
      '}\n```';

    const res = parseAiImport(messy);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.equal(res.work.scores.geral, 8.5);
    assert.equal(res.work.scores.historia, 7.5);
    assert.ok(res.warnings.some((w) => /BOM/i.test(w)));
    assert.ok(res.warnings.some((w) => /Aspas tipográficas/i.test(w)));
    assert.ok(res.warnings.some((w) => /Vírgula/i.test(w)));
    assert.ok(res.warnings.some((w) => /convertida para número/i.test(w)));
    assert.ok(res.warnings.some((w) => /arredondada/i.test(w)));
    assert.ok(res.emptyFields.includes('year'));
  });

  it('bloqueia nota > 10, score ausente, type inválido, status inválido e prós não-lista', () => {
    const badObj = makeValidRawObj({
      type: 'livro',
      status: 'desconhecido',
      pros: 'texto em vez de array',
      scores: {
        geral: 11,
        historia: 8,
        gameplay_ritmo: 8,
        graficos_fotografia: 8,
        trilha: 8
        // direcao_arte ausente
      }
    });

    const res = parseAiImport(JSON.stringify(badObj));
    assert.equal(res.ok, false);
    const fields = res.errors.map((e) => e.field);
    assert.ok(fields.includes('type'));
    assert.ok(fields.includes('status'));
    assert.ok(fields.includes('pros'));
    assert.ok(fields.includes('scores.geral'));
    assert.ok(fields.includes('scores.direcao_arte'));
  });

  it('rejeita entrada acima do limite, limita prós/contras a 8 e ignora __proto__ e chaves desconhecidas', () => {
    const huge = 'a'.repeat(MAX_INPUT_CHARS + 1);
    const overLimit = parseAiImport(huge);
    assert.equal(overLimit.ok, false);
    assert.ok(overLimit.errors.some((e) => e.field === 'input'));

    const payloadJson =
      '{"type":"anime","title":"Teste Limites","scores":{"geral":8,"historia":8,"gameplay_ritmo":8,"graficos_fotografia":8,"trilha":8,"direcao_arte":8},"pros":' +
      JSON.stringify(Array.from({ length: 10 }, (_, i) => `Pró ${i + 1}`)) +
      ',"cons":[],"status":"planned","verdict":"Ok","__proto__":{"polluted":true},"extraField":"ignorar"}';

    const res = parseAiImport(payloadJson);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.equal(res.work.pros.length, 8);
    assert.equal(({}).polluted, undefined);
    assert.equal(res.work.extraField, undefined);
    assert.ok(res.warnings.some((w) => w.includes('__proto__')));
    assert.ok(res.warnings.some((w) => w.includes('extraField')));
    assert.ok(res.warnings.some((w) => /limitado a 8/i.test(w)));
  });
});

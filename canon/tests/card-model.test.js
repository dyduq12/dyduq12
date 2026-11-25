import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWork } from '../js/core/schema.js';
import {
  EMPTY_SPEC_FALLBACK,
  buildCardModel,
  getCriterionLabelsForType,
  getHallOfFameInfo,
  getTechSpecsForWork
} from '../js/ui/card-model.js';

describe('card-model.js — modelo de exibição editorial puro', () => {
  it('gera ficha técnica em caixa alta correta por tipo de mídia', () => {
    const gameSpecs = getTechSpecsForWork({
      type: 'game',
      genre: 'RPG',
      studio: 'FromSoftware',
      soundtrack: 'Yuka Kitamura'
    });
    assert.deepEqual(
      gameSpecs.map((s) => s.label),
      ['GENRE', 'DEVELOPED BY', 'SOUNDTRACK']
    );

    const movieSpecs = getTechSpecsForWork({
      type: 'movie',
      genre: 'Drama',
      director: 'Céline Sciamma',
      soundtrack: 'Para One',
      starring: 'Noémie Merlant'
    });
    assert.deepEqual(
      movieSpecs.map((s) => s.label),
      ['GENRE', 'DIRECTED BY', 'SOUNDTRACK', 'STARRING']
    );

    const animeSpecs = getTechSpecsForWork({
      type: 'anime',
      genre: 'Sci-Fi',
      studio: 'Sunrise',
      director: 'Shinichiro Watanabe',
      soundtrack: 'Yoko Kanno',
      starring: 'Koichi Yamadera'
    });
    assert.deepEqual(
      animeSpecs.map((s) => s.label),
      ['GENRE', 'STUDIO', 'DIRECTED BY', 'SOUNDTRACK', 'STARRING']
    );
  });

  it('usa fallback "—" de forma consistente para campos vazios', () => {
    const work = createWork({
      title: 'Sem Metadados',
      type: 'series',
      year: 2022,
      genre: '',
      director: '   ',
      soundtrack: '',
      starring: ''
    });

    const model = buildCardModel(work);
    assert.equal(model.titleUpper, 'SEM METADADOS');
    assert.ok(model.techSpecs.every((spec) => spec.value === EMPTY_SPEC_FALLBACK));
    assert.equal(model.verdictText, EMPTY_SPEC_FALLBACK);
    assert.deepEqual(model.pros, [EMPTY_SPEC_FALLBACK]);
    assert.deepEqual(model.cons, [EMPTY_SPEC_FALLBACK]);
  });

  it('ativa selo Hall da Fama exatamente no limite >= 9,0', () => {
    assert.equal(getHallOfFameInfo(8.5).isHallOfFame, false);
    assert.equal(getHallOfFameInfo(8.5).badgeLabel, null);

    assert.equal(getHallOfFameInfo(9.0).isHallOfFame, true);
    assert.equal(getHallOfFameInfo(9.0).badgeLabel, 'HALL DA FAMA');

    assert.equal(getHallOfFameInfo(10).isHallOfFame, true);
  });

  it('adapta rótulos e percentuais das 4 barras de critérios por tipo', () => {
    assert.equal(getCriterionLabelsForType('game')[1].label, 'Gameplay');
    assert.equal(getCriterionLabelsForType('movie')[2].label, 'Fotografia');
    assert.equal(getCriterionLabelsForType('anime')[1].label, 'Ritmo / Animação');

    for (const type of ['game', 'movie', 'series', 'anime']) {
      const defs = getCriterionLabelsForType(type);
      assert.deepEqual(
        defs.map((d) => d.key),
        ['historia', 'gameplay_ritmo', 'graficos_fotografia', 'trilha']
      );
      assert.equal(defs[3].label, 'Trilha Sonora');
    }

    const work = createWork({
      title: 'Teste Barras',
      type: 'movie',
      scores: {
        geral: 9.0,
        historia: 9.5,
        gameplay_ritmo: 8.0,
        graficos_fotografia: 10.0,
        trilha: 7.5
      }
    });

    const model = buildCardModel(work);
    assert.equal(model.criteriaBars.length, 4);
    assert.equal(model.criteriaBars[0].label, 'História / Roteiro');
    assert.equal(model.criteriaBars[0].percent, 95);
    assert.equal(model.criteriaBars[2].percent, 100);
    assert.equal(model.hallOfFame.isHallOfFame, true);
  });

  it('exibe obra antiga com direcao_arte preenchida com apenas 4 barras', () => {
    const oldWork = createWork({
      title: 'Obra Antiga',
      type: 'game',
      scores: {
        geral: 9.0,
        historia: 9.5,
        gameplay_ritmo: 8.0,
        graficos_fotografia: 10.0,
        trilha: 7.5,
        direcao_arte: 8.5
      }
    });
    assert.equal(oldWork.scores.direcao_arte, 8.5);

    for (const type of ['game', 'movie', 'series', 'anime']) {
      const model = buildCardModel({ ...oldWork, type });
      assert.equal(model.criteriaBars.length, 4);
      assert.equal(model.criteriaBars.some((bar) => bar.key === 'direcao_arte'), false);
      assert.equal(model.criteriaBars.some((bar) => /Dire[çc][ãa]o de Arte/i.test(bar.label)), false);
    }
  });

  it('formata a nota geral em múltiplos de 0,125 com 1 casa decimal, sem perder o valor exato', () => {
    const cases = [
      [8.875, '8,9'],
      [8.75, '8,8'],
      [9.375, '9,4'],
      [8.5, '8,5'],
      [10, '10,0'],
      [0, '0,0']
    ];
    for (const [value, expected] of cases) {
      const model = buildCardModel(createWork({ title: 'Média', scores: { geral: value } }));
      assert.equal(model.geralFormatted, expected, `geral ${value}`);
      assert.equal(model.geralScore, value);
    }

    const exact = buildCardModel(createWork({ title: 'Média Exata', scores: { geral: 8.875 } }));
    assert.equal(exact.hallOfFame.isHallOfFame, false);

    const bars = buildCardModel(
      createWork({
        title: 'Barras',
        scores: { geral: 8.875, historia: 9, gameplay_ritmo: 9, graficos_fotografia: 9, trilha: 8.5 }
      })
    ).criteriaBars;
    assert.deepEqual(
      bars.map((bar) => bar.scoreFormatted),
      ['9,0', '9,0', '9,0', '8,5']
    );
  });

  it('mantém sourceLabel e campos estruturais do view-model intactos', () => {
    const model = buildCardModel(createWork({ title: 'Estrutura', type: 'anime', year: 2020 }));
    assert.equal(model.sourceLabel, 'public');
    assert.equal(buildCardModel({ ...createWork({ title: 'Local' }), source: 'local' }).sourceLabel, 'local');

    for (const field of [
      'id',
      'type',
      'typeLabel',
      'titleRaw',
      'titleUpper',
      'monogram',
      'yearText',
      'cover',
      'palette',
      'techSpecs',
      'geralScore',
      'geralFormatted',
      'hallOfFame',
      'criteriaBars',
      'pros',
      'cons',
      'statusLabel',
      'verdictText',
      'sourceLabel'
    ]) {
      assert.ok(field in model, `Campo "${field}" deve existir no view-model`);
    }
  });
});

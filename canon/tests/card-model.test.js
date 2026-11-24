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

  it('adapta rótulos e percentuais das 5 barras de critérios por tipo', () => {
    assert.equal(getCriterionLabelsForType('game')[1].label, 'Gameplay');
    assert.equal(getCriterionLabelsForType('movie')[2].label, 'Fotografia');
    assert.equal(getCriterionLabelsForType('anime')[1].label, 'Ritmo / Animação');

    const work = createWork({
      title: 'Teste Barras',
      type: 'movie',
      scores: {
        geral: 9.0,
        historia: 9.5,
        gameplay_ritmo: 8.0,
        graficos_fotografia: 10.0,
        trilha: 7.5,
        direcao_arte: 8.5
      }
    });

    const model = buildCardModel(work);
    assert.equal(model.criteriaBars.length, 5);
    assert.equal(model.criteriaBars[0].label, 'História / Roteiro');
    assert.equal(model.criteriaBars[0].percent, 95);
    assert.equal(model.criteriaBars[2].percent, 100);
    assert.equal(model.hallOfFame.isHallOfFame, true);
  });
});

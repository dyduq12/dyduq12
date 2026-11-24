import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mergeAiWithApi } from '../js/ai/import-merge.js';
import { createWork } from '../js/core/schema.js';

describe('import-merge.js — mesclagem IA + API', () => {
  it('nunca sobrescreve campos preenchidos pela IA e só preenche vazios da API', () => {
    const aiWork = createWork({
      type: 'movie',
      title: 'Blade Runner',
      year: 1982,
      genre: 'Neo-noir',
      studio: '',
      director: 'Ridley Scott (IA)',
      soundtrack: '',
      starring: '',
      scores: {
        geral: 9.5,
        historia: 9.0,
        gameplay_ritmo: 8.5,
        graficos_fotografia: 10.0,
        trilha: 10.0,
        direcao_arte: 10.0
      },
      pros: ['Atmosfera única'],
      cons: ['Ritmo lento'],
      status: 'completed',
      verdict: 'Clássico absoluto.'
    });

    const apiResult = {
      id: 'tmdb:78',
      type: 'movie',
      title: 'Blade Runner: The Final Cut',
      year: 2007,
      genre: 'Science Fiction, Drama',
      studio: 'The Ladd Company',
      director: 'Ridley Scott',
      soundtrack: 'Vangelis',
      starring: 'Harrison Ford, Rutger Hauer',
      coverUrl: 'https://image.tmdb.org/t/p/w500/br.jpg'
    };

    const { work, filledFromApi, preservedFromAi } = mergeAiWithApi(aiWork, apiResult, {
      emptyFields: ['studio', 'soundtrack', 'starring']
    });

    // Campos da IA/usuário preservados intactos
    assert.equal(work.title, 'Blade Runner');
    assert.equal(work.year, 1982);
    assert.equal(work.genre, 'Neo-noir');
    assert.equal(work.director, 'Ridley Scott (IA)');
    assert.equal(work.scores.geral, 9.5);
    assert.equal(work.verdict, 'Clássico absoluto.');

    // Campos vazios preenchidos pela API + ID promovido para provider:id
    assert.equal(work.id, 'tmdb:78');
    assert.equal(work.studio, 'The Ladd Company');
    assert.equal(work.soundtrack, 'Vangelis');
    assert.equal(work.starring, 'Harrison Ford, Rutger Hauer');
    assert.equal(work.coverUrl, 'https://image.tmdb.org/t/p/w500/br.jpg');

    assert.deepEqual(filledFromApi.sort(), ['coverUrl', 'id', 'soundtrack', 'starring', 'studio'].sort());
    assert.ok(preservedFromAi.includes('year'));
    assert.ok(preservedFromAi.includes('director'));
  });

  it('preenche year quando marcado em emptyFields e mantém manual:<uuid> sem resultado de API', () => {
    const aiWork = createWork({
      type: 'anime',
      title: 'Akira',
      year: 2026,
      studio: ''
    });

    const withoutApi = mergeAiWithApi(aiWork, null, { emptyFields: ['year', 'studio'] });
    assert.ok(withoutApi.work.id.startsWith('manual:'));
    assert.deepEqual(withoutApi.filledFromApi, []);

    const withApi = mergeAiWithApi(
      aiWork,
      { id: 'anilist:47', year: 1988, studio: 'Tokyo Movie Shinsha' },
      { emptyFields: ['year', 'studio'] }
    );
    assert.equal(withApi.work.id, 'anilist:47');
    assert.equal(withApi.work.year, 1988);
    assert.equal(withApi.work.studio, 'Tokyo Movie Shinsha');
    assert.ok(withApi.filledFromApi.includes('year'));
    assert.ok(withApi.filledFromApi.includes('studio'));
  });
});

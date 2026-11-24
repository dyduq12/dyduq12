import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  computePosterLayout,
  fitTextBlock,
  wrapTextLines
} from '../js/export/layout.js';

function fakeMeasure(text, fontSize) {
  return Array.from(String(text || '')).length * fontSize * 0.52;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function assertInsidePoster(rect, name) {
  assert.ok(rect, `${name} deve existir`);
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(Number.isFinite(rect[key]), `${name}.${key} deve ser finito`);
  }
  assert.ok(rect.x >= 0, `${name}.x >= 0`);
  assert.ok(rect.y >= 0, `${name}.y >= 0`);
  assert.ok(rect.width > 0, `${name}.width > 0`);
  assert.ok(rect.height > 0, `${name}.height > 0`);
  assert.ok(rect.x + rect.width <= POSTER_WIDTH, `${name} cabe em 1080px`);
  assert.ok(rect.y + rect.height <= POSTER_HEIGHT, `${name} cabe em 1350px`);
}

describe('layout.js — cálculo puro de pôster 1080x1350', () => {
  it('ajusta fonte e quebra títulos curtos, de 200 caracteres e palavra única sem espaços', () => {
    const shortFit = fitTextBlock({
      text: 'AKIRA',
      measure: fakeMeasure,
      fontFamily: 'sans-serif',
      maxWidth: 500,
      maxLines: 3,
      maxFontSize: 70,
      minFontSize: 30
    });
    assert.equal(shortFit.fontSize, 70);
    assert.equal(shortFit.lines.length, 1);
    assert.equal(shortFit.truncated, false);

    const longTitle = 'A '.repeat(100).trim();
    const longFit = fitTextBlock({
      text: longTitle,
      measure: fakeMeasure,
      fontFamily: 'sans-serif',
      maxWidth: 460,
      maxLines: 3,
      maxFontSize: 70,
      minFontSize: 30
    });
    assert.ok(longFit.fontSize <= 70 && longFit.fontSize >= 30);
    assert.ok(longFit.lines.length <= 3);
    for (const line of longFit.lines) {
      assert.ok(fakeMeasure(line, longFit.fontSize) <= 460, `Linha excedeu largura máxima: ${line}`);
    }

    const giantWord = 'SUPERCALIFRAGILISTICOESPIRALIDOSOEXTRALONGOSEMESPACOS'.repeat(3);
    const wordWrap = wrapTextLines({
      text: giantWord,
      measure: fakeMeasure,
      fontFamily: 'sans-serif',
      fontSize: 30,
      maxWidth: 320,
      maxLines: 3
    });
    assert.ok(wordWrap.lines.length <= 3);
    assert.equal(wordWrap.truncated, true);
    assert.ok(wordWrap.lines[wordWrap.lines.length - 1].endsWith('…'));
    for (const line of wordWrap.lines) {
      assert.ok(fakeMeasure(line, 30) <= 320, `Token sem espaço excedeu largura: ${line}`);
    }
  });

  it('mantém todos os retângulos dentro de 1080x1350 e sem sobreposição entre regiões principais', () => {
    const work = {
      id: 'anilist:1',
      type: 'anime',
      title: 'Cowboy Bebop: Knockin on Heavens Door',
      year: 2001,
      genre: 'Sci-Fi, Noir',
      studio: 'Bones',
      director: 'Shinichiro Watanabe',
      soundtrack: 'Yoko Kanno',
      starring: 'Koichi Yamadera',
      scores: {
        geral: 9.5,
        historia: 9.5,
        gameplay_ritmo: 9,
        graficos_fotografia: 10,
        trilha: 10,
        direcao_arte: 9.5
      },
      status: 'completed',
      verdict: 'Clássico absoluto com trilha atemporal.'
    };

    const withMascots = computePosterLayout(work, { measure: fakeMeasure, showMascots: true });
    assert.equal(withMascots.width, 1080);
    assert.equal(withMascots.height, 1350);

    const regions = [
      ['headerRect', withMascots.headerRect],
      ['coverRect', withMascots.coverRect],
      ['titleRect', withMascots.titleRect],
      ['specsRect', withMascots.specsRect],
      ['scoreRect', withMascots.scoreRect],
      ['barsRect', withMascots.barsRect],
      ['mascotRect', withMascots.mascotRect],
      ['footerRect', withMascots.footerRect]
    ];

    for (const [name, rect] of regions) {
      assertInsidePoster(rect, name);
    }
    assertInsidePoster(withMascots.badgeRect, 'badgeRect');

    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        const [nameA, rectA] = regions[i];
        const [nameB, rectB] = regions[j];
        assert.equal(rectsOverlap(rectA, rectB), false, `Sobreposição entre ${nameA} e ${nameB}`);
      }
    }

    const withoutMascots = computePosterLayout(work, { measure: fakeMeasure, showMascots: false });
    assert.equal(withoutMascots.mascotRect, null);
    assert.equal(rectsOverlap(withoutMascots.barsRect, withoutMascots.footerRect), false);
    assert.ok(withoutMascots.barsRect.height > withMascots.barsRect.height);
  });

  it('lida com campos vazios e diferentes tipos de obra (game, movie, series, anime)', () => {
    const emptyGame = computePosterLayout(
      {
        id: 'manual:x',
        type: 'game',
        title: '',
        year: null,
        genre: '',
        studio: '',
        director: '',
        soundtrack: '',
        starring: '',
        scores: { geral: 6.5 }
      },
      { measure: fakeMeasure }
    );
    assert.deepEqual(
      emptyGame.specsRows.map((r) => r.label),
      ['GENRE', 'DEVELOPED BY', 'SOUNDTRACK']
    );
    assert.ok(emptyGame.specsRows.every((r) => r.value === '—'));

    const movie = computePosterLayout({ id: 'tmdb:1', type: 'movie', title: 'Dune', scores: { geral: 8.5 } });
    assert.deepEqual(
      movie.specsRows.map((r) => r.label),
      ['GENRE', 'DIRECTED BY', 'SOUNDTRACK', 'STARRING']
    );

    const series = computePosterLayout({ id: 'tmdb:2', type: 'series', title: 'Severance', scores: { geral: 8.5 } });
    assert.deepEqual(
      series.specsRows.map((r) => r.label),
      ['GENRE', 'DIRECTED BY', 'SOUNDTRACK', 'STARRING']
    );

    const anime = computePosterLayout({ id: 'anilist:2', type: 'anime', title: 'Akira', scores: { geral: 9.0 } });
    assert.deepEqual(
      anime.specsRows.map((r) => r.label),
      ['GENRE', 'STUDIO', 'DIRECTED BY', 'SOUNDTRACK', 'STARRING']
    );
  });
});

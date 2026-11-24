import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isValidPaletteColor } from '../js/core/schema.js';
import { extractPaletteFromPixels } from '../js/media/palette.js';

function makePixels(entries) {
  const arr = new Uint8ClampedArray(entries.length * 4);
  entries.forEach(([r, g, b, a = 255], idx) => {
    const offset = idx * 4;
    arr[offset] = r;
    arr[offset + 1] = g;
    arr[offset + 2] = b;
    arr[offset + 3] = a;
  });
  return arr;
}

describe('palette.js — quantização pura sem extremos proibidos', () => {
  it('extrai duas cores dominantes ignorando transparência e extremos próximos', () => {
    const pixels = makePixels([
      [255, 255, 255, 255],
      [250, 250, 250, 255],
      [0, 0, 0, 255],
      [10, 10, 10, 255],
      [30, 120, 200, 0],
      [180, 40, 60, 255],
      [182, 42, 62, 255],
      [178, 38, 58, 255],
      [35, 110, 140, 255],
      [38, 114, 144, 255]
    ]);

    const palette = extractPaletteFromPixels(pixels);
    assert.equal(palette.length, 2);
    assert.equal(isValidPaletteColor(palette[0]), true);
    assert.equal(isValidPaletteColor(palette[1]), true);
    assert.notEqual(palette[0], palette[1]);
  });

  it('ajusta automaticamente pixels 100% extremos para nunca retornar hex proibido', () => {
    const pureLightHex = '#' + 'f'.repeat(6);
    const pureDarkHex = '#' + '0'.repeat(6);

    const allLight = makePixels([
      [255, 255, 255, 255],
      [255, 255, 255, 255]
    ]);
    const lightPalette = extractPaletteFromPixels(allLight);
    assert.equal(isValidPaletteColor(lightPalette[0]), true);
    assert.equal(isValidPaletteColor(lightPalette[1]), true);
    assert.notEqual(lightPalette[0].toLowerCase(), pureLightHex);
    assert.notEqual(lightPalette[1].toLowerCase(), pureLightHex);

    const allDark = makePixels([
      [0, 0, 0, 255],
      [0, 0, 0, 255]
    ]);
    const darkPalette = extractPaletteFromPixels(allDark);
    assert.equal(isValidPaletteColor(darkPalette[0]), true);
    assert.equal(isValidPaletteColor(darkPalette[1]), true);
    assert.notEqual(darkPalette[0].toLowerCase(), pureDarkHex);
    assert.notEqual(darkPalette[1].toLowerCase(), pureDarkHex);
  });

  it('retorna paleta padrão válida para entradas vazias ou totalmente transparentes', () => {
    const emptyPalette = extractPaletteFromPixels(new Uint8ClampedArray(0));
    assert.equal(emptyPalette.length, 2);
    assert.equal(isValidPaletteColor(emptyPalette[0]), true);
    assert.equal(isValidPaletteColor(emptyPalette[1]), true);

    const transparentPalette = extractPaletteFromPixels(makePixels([[120, 40, 200, 0]]));
    assert.equal(isValidPaletteColor(transparentPalette[0]), true);
    assert.equal(isValidPaletteColor(transparentPalette[1]), true);
  });
});

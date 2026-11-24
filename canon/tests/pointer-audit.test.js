import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function collectFiles(relDir, ext) {
  const fullDir = path.join(ROOT_DIR, relDir);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const relPath = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(relPath, ext)));
    } else if (entry.isFile() && (!ext || entry.name.endsWith(ext))) {
      results.push(relPath);
    }
  }
  return results;
}

describe('pointer-audit.test.js — conformidade R3 de Pointer Events e touch-action', () => {
  it('todo módulo em js/ que registra pointerdown também usa setPointerCapture, pointercancel e lostpointercapture', async () => {
    const jsFiles = await collectFiles('js', '.js');
    const pointerModules = [];

    for (const relPath of jsFiles) {
      const src = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      if (src.includes("addEventListener('pointerdown'") || src.includes('addEventListener("pointerdown"')) {
        pointerModules.push(relPath);
        assert.ok(
          src.includes('setPointerCapture'),
          `${relPath} registra pointerdown mas não chama setPointerCapture`
        );
        assert.ok(
          src.includes('pointercancel'),
          `${relPath} registra pointerdown mas não trata pointercancel`
        );
        assert.ok(
          src.includes('lostpointercapture'),
          `${relPath} registra pointerdown mas não trata lostpointercapture`
        );
        assert.ok(
          src.includes("addEventListener('pointerup'") || src.includes('addEventListener("pointerup"'),
          `${relPath} registra pointerdown mas não trata pointerup`
        );
      }
    }

    assert.deepEqual(
      pointerModules.sort(),
      ['js/mascots/dock.js', 'js/ui/card.js', 'js/ui/sliders.js']
    );
  });

  it('CSS define touch-action adequado para sliders (none), cards/mascotes (pan-y) e botões (manipulation)', async () => {
    const baseCss = await readFile(path.join(ROOT_DIR, 'css/base.css'), 'utf8');
    const cardCss = await readFile(path.join(ROOT_DIR, 'css/card.css'), 'utf8');

    assert.match(baseCss, /\.canon-slider-track\s*\{[^}]*touch-action:\s*none;/s);
    assert.match(baseCss, /\.canon-mascot-canvas\s*\{[^}]*touch-action:\s*pan-y;/s);
    assert.match(baseCss, /button,\s*\.canon-file-label\s*\{[^}]*touch-action:\s*manipulation;/s);
    assert.match(cardCss, /\.canon-card-flip-btn\s*\{[^}]*touch-action:\s*pan-y;/s);
  });
});

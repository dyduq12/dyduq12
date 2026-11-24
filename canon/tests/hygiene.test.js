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

describe('hygiene.test.js — ObjectURLs, loop rAF único, catch vazios, console.log e R1/R7', () => {
  it('todo módulo com createObjectURL possui revokeObjectURL correspondente no mesmo arquivo', async () => {
    const jsFiles = await collectFiles('js', '.js');
    const checked = [];

    for (const relPath of jsFiles) {
      const src = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      if (src.includes('createObjectURL(')) {
        checked.push(relPath);
        assert.ok(
          src.includes('revokeObjectURL('),
          `${relPath} chama createObjectURL sem revokeObjectURL correspondente`
        );
      }
    }

    assert.ok(checked.length >= 4);
  });

  it('mantém no máximo um módulo agendando requestAnimationFrame no runtime, com cancelAnimationFrame e pausa', async () => {
    const jsFiles = await collectFiles('js', '.js');
    const rafModules = [];

    for (const relPath of jsFiles) {
      const src = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      if (/\brequestAnimationFrame\s*\(/.test(src)) {
        rafModules.push(relPath);
        assert.ok(src.includes('cancelAnimationFrame('), `${relPath} deve cancelar requestAnimationFrame`);
        assert.ok(src.includes('visibilitychange'), `${relPath} deve pausar em visibilitychange`);
        assert.ok(src.includes('IntersectionObserver'), `${relPath} deve pausar fora da viewport`);
      }
    }

    assert.deepEqual(rafModules, ['js/mascots/dock.js']);
  });

  it('não contém console.log de depuração, blocos catch vazios, innerHTML, localStorage nem eval em js/', async () => {
    const jsFiles = await collectFiles('js', '.js');
    const emptyCatchRe = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)?\s*\}/;

    for (const relPath of jsFiles) {
      const src = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      assert.equal(/\bconsole\.log\s*\(/.test(src), false, `console.log encontrado em ${relPath}`);
      assert.equal(emptyCatchRe.test(src), false, `Bloco catch vazio encontrado em ${relPath}`);
      assert.equal(/\binnerHTML\b/.test(src), false, `innerHTML encontrado em ${relPath}`);
      assert.equal(/\blocalStorage\b/.test(src), false, `localStorage encontrado em ${relPath}`);
      assert.equal(/\beval\s*\(/.test(src), false, `eval() encontrado em ${relPath}`);
    }
  });
});

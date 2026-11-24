import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function collectCssFiles() {
  const entries = await readdir(path.join(ROOT_DIR, 'css'), { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.css')).map((e) => `css/${e.name}`);
}

describe('a11y-static.test.js — HTML acessível, safe-area R4, 100dvh, foco e reduced-motion', () => {
  it('index.html possui lang="pt-BR", viewport-fit=cover, favicon data:, noscript e nomes acessíveis', async () => {
    const html = await readFile(path.join(ROOT_DIR, 'index.html'), 'utf8');

    assert.match(html, /<html\b[^>]*lang="pt-BR"/i);
    assert.match(html, /<meta\b[^>]*name="viewport"[^>]*viewport-fit=cover/i);
    assert.match(html, /<link\b[^>]*rel="icon"[^>]*href="data:,"/i);
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/i);

    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const attrs = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      const hasAriaLabel = /aria-label\s*=\s*"[^"]+"/i.test(attrs) || /aria-labelledby\s*=\s*"[^"]+"/i.test(attrs);
      assert.ok(text.length > 0 || hasAriaLabel, `Botão sem nome acessível no HTML: ${match[0]}`);
    }

    for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = match[1];
      const idMatch = attrs.match(/\bid="([^"]+)"/i);
      const hasAria = /aria-label\s*=\s*"[^"]+"/i.test(attrs) || /aria-labelledby\s*=\s*"[^"]+"/i.test(attrs);
      const hasLabelFor = idMatch && new RegExp(`<label\\b[^>]*\\bfor="${idMatch[1]}"`, 'i').test(html);
      assert.ok(hasAria || hasLabelFor, `Input sem rótulo acessível no HTML: ${match[0]}`);
    }
  });

  it('CSS acompanha cada regra 100vh com 100dvh, define :focus-visible, safe-area e prefers-reduced-motion', async () => {
    const cssFiles = await collectCssFiles();
    let combinedCss = '';

    for (const relPath of cssFiles) {
      const css = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      combinedCss += `\n${css}`;

      for (const block of css.split('}')) {
        const declarations = block.split('{')[1] || '';
        if (declarations.includes('100vh')) {
          assert.match(
            declarations,
            /100vh[\s\S]*100dvh/,
            `${relPath}: ocorrência de 100vh sem fallback seguido de 100dvh na mesma regra`
          );
        }
      }
    }

    assert.match(combinedCss, /:focus-visible\s*\{/);
    assert.match(combinedCss, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    assert.match(combinedCss, /env\(safe-area-inset-top\)/);
    assert.match(combinedCss, /env\(safe-area-inset-bottom\)/);
  });
});

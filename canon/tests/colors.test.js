import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function collectFiles(relDir) {
  const fullDir = path.join(ROOT_DIR, relDir);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const relPath = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(relPath)));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

function parseHexToRgb(hex) {
  const clean = hex.trim().slice(1);
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function channelLuminance(c8) {
  const srgb = c8 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const { r, g, b } = parseHexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseTokensByTheme(tokensCss) {
  const clean = stripCssComments(tokensCss);
  const blocks = clean.split('}');
  const paper = {};
  const slate = {};

  for (const block of blocks) {
    const [selectorPart, bodyPart] = block.split('{');
    if (!bodyPart) {
      continue;
    }
    const target = selectorPart.includes('[data-theme="slate"]')
      ? slate
      : selectorPart.includes(':root') || selectorPart.includes('[data-theme="paper"]')
        ? paper
        : null;
    if (!target) {
      continue;
    }
    for (const match of bodyPart.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      target[match[1]] = match[2].trim();
    }
  }

  return {
    paper,
    slate: { ...paper, ...slate }
  };
}

describe('colors.test.js — higiene R7, tokens centralizados e contraste WCAG', () => {
  it('não contém cores proibidas (#fff, #000, pure rgb, nomes proibidos) em css/, js/ e index.html', async () => {
    const cssFiles = await collectFiles('css');
    const jsFiles = await collectFiles('js');
    const targets = ['index.html', ...cssFiles, ...jsFiles];

    const f3 = 'f'.repeat(3);
    const f6 = 'f'.repeat(6);
    const z3 = '0'.repeat(3);
    const z6 = '0'.repeat(6);
    const wWord = ['wh', 'ite'].join('');
    const bWord = ['bl', 'ack'].join('');

    const forbiddenPatterns = [
      new RegExp(`#(?:${f6}|${f3}|${z6}|${z3})(?![0-9a-f])`, 'i'),
      new RegExp(`(^|[^a-zA-Z-])(?:${wWord}|${bWord})(?![a-zA-Z-])`, 'i'),
      /rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i,
      /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i
    ];

    for (const relPath of targets) {
      const raw = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      const stripped = relPath.endsWith('.css')
        ? stripCssComments(raw)
        : relPath.endsWith('.js')
          ? stripJsComments(raw)
          : stripHtmlComments(raw);

      for (const pattern of forbiddenPatterns) {
        const hit = stripped.match(pattern);
        assert.equal(
          hit,
          null,
          `Cor ou termo proibido encontrado em ${relPath}: ${hit?.[0]}`
        );
      }
    }
  });

  it('não declara cores literais fora de css/tokens.css (exceto fallback --work-a/--work-b em schema.js)', async () => {
    const cssFiles = (await collectFiles('css')).filter((f) => f !== 'css/tokens.css');
    const jsFiles = await collectFiles('js');
    const targets = ['index.html', ...cssFiles, ...jsFiles];

    const literalColorRe = /(#[0-9a-f]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d)/i;

    for (const relPath of targets) {
      const raw = await readFile(path.join(ROOT_DIR, relPath), 'utf8');
      const stripped = relPath.endsWith('.css')
        ? stripCssComments(raw)
        : relPath.endsWith('.js')
          ? stripJsComments(raw)
          : stripHtmlComments(raw);

      // Documented exception: fallback palette array for --work-a / --work-b in js/core/schema.js
      const sanitized =
        relPath === 'js/core/schema.js'
          ? stripped.replace(/export const DEFAULT_PALETTE\s*=\s*Object\.freeze\(\[[^\]]+\]\);/, '')
          : stripped;

      const hit = sanitized.match(literalColorRe);
      assert.equal(hit, null, `Cor literal inesperada fora de tokens.css em ${relPath}: ${hit?.[0]}`);
    }
  });

  it('todo var(--x) usado em qualquer CSS está definido em css/tokens.css', async () => {
    const tokensCss = await readFile(path.join(ROOT_DIR, 'css/tokens.css'), 'utf8');
    const { paper, slate } = parseTokensByTheme(tokensCss);
    const definedTokens = new Set([...Object.keys(paper), ...Object.keys(slate)]);

    const cssFiles = await collectFiles('css');
    for (const relPath of cssFiles) {
      const raw = stripCssComments(await readFile(path.join(ROOT_DIR, relPath), 'utf8'));
      for (const match of raw.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const tokenName = match[1];
        assert.ok(definedTokens.has(tokenName), `Token ${tokenName} usado em ${relPath} não está em tokens.css`);
      }
    }
  });

  it('atende contraste mínimo WCAG >= 4,5:1 para texto e texto secundário nos temas paper e slate', async () => {
    const tokensCss = await readFile(path.join(ROOT_DIR, 'css/tokens.css'), 'utf8');
    const themes = parseTokensByTheme(tokensCss);

    for (const [themeName, tokens] of Object.entries(themes)) {
      const textOnBg = contrastRatio(tokens['--color-text'], tokens['--color-bg']);
      const textOnSurface = contrastRatio(tokens['--color-text'], tokens['--color-surface']);
      const mutedOnBg = contrastRatio(tokens['--color-text-muted'], tokens['--color-bg']);
      const mutedOnSurface = contrastRatio(tokens['--color-text-muted'], tokens['--color-surface']);

      assert.ok(textOnBg >= 4.5, `${themeName}: --color-text/--color-bg = ${textOnBg.toFixed(2)}`);
      assert.ok(textOnSurface >= 4.5, `${themeName}: --color-text/--color-surface = ${textOnSurface.toFixed(2)}`);
      assert.ok(mutedOnBg >= 4.5, `${themeName}: --color-text-muted/--color-bg = ${mutedOnBg.toFixed(2)}`);
      assert.ok(mutedOnSurface >= 4.5, `${themeName}: --color-text-muted/--color-surface = ${mutedOnSurface.toFixed(2)}`);
    }
  });
});

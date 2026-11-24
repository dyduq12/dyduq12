import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 4199;
      srv.close(() => resolve(port));
    });
  });
}

function assertContentType(relPath, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (relPath === '' || relPath.endsWith('.html')) {
    assert.ok(ct.startsWith('text/html'), `${relPath}: Content-Type inesperado "${contentType}"`);
  } else if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
    assert.ok(ct.startsWith('text/javascript'), `${relPath}: Content-Type inesperado "${contentType}"`);
  } else if (relPath.endsWith('.css')) {
    assert.ok(ct.startsWith('text/css'), `${relPath}: Content-Type inesperado "${contentType}"`);
  } else if (relPath.endsWith('.json')) {
    assert.ok(ct.startsWith('application/json'), `${relPath}: Content-Type inesperado "${contentType}"`);
  } else if (relPath.endsWith('.svg')) {
    assert.ok(ct.startsWith('image/svg+xml'), `${relPath}: Content-Type inesperado "${contentType}"`);
  }
}

function isRelativeAsset(ref) {
  if (!ref || typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:')
  ) {
    return false;
  }
  if (trimmed.startsWith('/')) {
    throw new Error(`Caminho iniciado por "/" proibido para GitHub Pages em subpasta (/canon/): "${trimmed}"`);
  }
  return true;
}

function resolveUnderCanon(fromRelPath, spec) {
  const cleanSpec = spec.split('#')[0].split('?')[0];
  const baseDir = fromRelPath ? path.posix.dirname(fromRelPath) : '.';
  return path.posix.normalize(path.posix.join(baseDir, cleanSpec));
}

function extractHtmlAssets(html) {
  const refs = [];
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"][^>]*>/gi)) {
    const tag = m[0];
    if (/\brel\s*=\s*['"]stylesheet['"]/i.test(tag)) {
      refs.push(m[1]);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"][^>]*>/gi)) {
    refs.push(m[1]);
  }
  return refs;
}

function extractCssRefs(css) {
  const withoutDataUris = css.replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)/gi, '');
  const refs = [];
  for (const m of withoutDataUris.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/gi)) {
    refs.push(m[1]);
  }
  for (const m of withoutDataUris.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    refs.push(m[1]);
  }
  return refs;
}

function extractJsRefs(js, relPath) {
  // Do not attempt module traversal inside pre-bundled minified vendor library
  if (relPath.startsWith('vendor/')) {
    return [];
  }
  const refs = [];
  const staticRe = /(?:^|[\n;])\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const m of js.matchAll(staticRe)) {
    refs.push(m[1]);
  }
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of js.matchAll(dynamicRe)) {
    refs.push(m[1]);
  }
  // Follow relative JSON catalog reference in store.js
  for (const m of js.matchAll(/['"](data\/[a-zA-Z0-9_.-]+\.json)['"]/g)) {
    refs.push(`../../${m[1]}`);
  }
  return refs;
}

async function runSmoke() {
  const port = await getFreePort();
  const srv = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout ao iniciar scripts/serve.mjs')), 5000);
      srv.stdout.on('data', (chunk) => {
        if (chunk.toString().includes(String(port))) {
          clearTimeout(timer);
          resolve();
        }
      });
      srv.stderr.on('data', (chunk) => {
        clearTimeout(timer);
        reject(new Error(chunk.toString()));
      });
      srv.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Servidor encerrou prematuramente com código ${code}`));
      });
    });

    const visited = new Set();
    const queue = [''];

    while (queue.length > 0) {
      const relPath = queue.shift();
      if (visited.has(relPath)) continue;
      visited.add(relPath);

      const urlPath = relPath ? `/canon/${relPath}` : '/canon/';
      const res = await fetch(`http://127.0.0.1:${port}${urlPath}`);
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status} para ${urlPath}`);
      }
      const contentType = res.headers.get('content-type');
      assertContentType(relPath, contentType);
      const bodyText = await res.text();

      let nextRefs = [];
      if (relPath === '' || relPath.endsWith('.html')) {
        nextRefs = extractHtmlAssets(bodyText);
      } else if (relPath.endsWith('.css')) {
        nextRefs = extractCssRefs(bodyText);
      } else if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
        nextRefs = extractJsRefs(bodyText, relPath);
      }

      for (const spec of nextRefs) {
        if (!isRelativeAsset(spec)) continue;
        const resolved = resolveUnderCanon(relPath, spec);
        if (!visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }

    console.log(`SMOKE_OK resources=${visited.size} base=http://127.0.0.1:${port}/canon/`);
  } finally {
    srv.kill();
  }
}

runSmoke().catch((err) => {
  console.error('[smoke] FALHA:', err?.message || err);
  process.exitCode = 1;
});

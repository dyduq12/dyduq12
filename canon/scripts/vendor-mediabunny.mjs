import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'node_modules', 'mediabunny');
const TARGET_DIR = path.join(ROOT_DIR, 'vendor', 'mediabunny');

async function main() {
  const pkgRaw = await readFile(path.join(SOURCE_DIR, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);

  await mkdir(TARGET_DIR, { recursive: true });

  const bundleSrc = path.join(SOURCE_DIR, 'dist', 'bundles', 'mediabunny.min.mjs');
  const licenseSrc = path.join(SOURCE_DIR, 'LICENSE');

  await copyFile(bundleSrc, path.join(TARGET_DIR, 'mediabunny.min.mjs'));
  await copyFile(licenseSrc, path.join(TARGET_DIR, 'LICENSE'));

  const metadata = {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    bundle: 'dist/bundles/mediabunny.min.mjs'
  };
  await writeFile(
    path.join(TARGET_DIR, 'version.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );

  console.log(`Vendorized ${pkg.name}@${pkg.version} (${pkg.license}) -> vendor/mediabunny/`);
}

main().catch((err) => {
  console.error('[vendor-mediabunny] Falha ao copiar bundle:', err);
  process.exitCode = 1;
});

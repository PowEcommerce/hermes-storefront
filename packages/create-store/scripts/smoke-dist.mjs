// Corre el binario buildeado (dist/index.js): --help y una tienda de verdad
// con --no-install en una carpeta temporal (en CI, también con Node 18).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const primera = readFileSync(bin, 'utf8').split('\n')[0];
if (primera !== '#!/usr/bin/env node') throw new Error(`sin shebang: ${primera}`);

const ayuda = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
if (!ayuda.includes('npm create @hermesecommerce/store')) throw new Error(`--help inesperado:\n${ayuda}`);

const dir = mkdtempSync(join(tmpdir(), 'create-store-smoke-'));
// Sin terminal y sin --template: demo. Con --template skeleton: el mínimo.
for (const [carpeta, args, propio] of [
  ['tienda', [], 'components/header/Header.tsx'],
  ['esqueleto', ['--template', 'skeleton'], 'components/Header.tsx'],
]) {
  execFileSync(process.execPath, [bin, carpeta, '--no-install', ...args], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, HERMES_CONFIG_DIR: join(dir, 'cfg') },
  });
  const raiz = join(dir, carpeta);
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
  if (pkg.name !== carpeta) throw new Error(`name: ${pkg.name}`);
  if (String(pkg.dependencies['@hermesecommerce/storefront']).startsWith('file:')) throw new Error('quedó un file:');
  if (!/^\^\d/.test(String(pkg.devDependencies?.['@hermesecommerce/cli'])))
    throw new Error(`la CLI no viaja como devDependency publicada: ${pkg.devDependencies?.['@hermesecommerce/cli']}`);
  for (const f of ['app/layout.tsx', '.gitignore', '.env.example', propio])
    if (!existsSync(join(raiz, f))) throw new Error(`${carpeta}: falta ${f}`);
  for (const f of ['.env', 'node_modules', '_npmrc', '_gitignore'])
    if (existsSync(join(raiz, f))) throw new Error(`${carpeta}: se copió ${f}`);
  const npmrc = readFileSync(join(raiz, '.npmrc'), 'utf8');
  if (!/^legacy-peer-deps=true$/m.test(npmrc) || npmrc.includes('install-links'))
    throw new Error(`${carpeta}: .npmrc inesperado:\n${npmrc}`);
}

console.log(`smoke OK (node ${process.versions.node})`);

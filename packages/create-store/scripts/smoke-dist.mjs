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
execFileSync(process.execPath, [bin, 'tienda', '--no-install'], {
  cwd: dir,
  stdio: 'pipe',
  env: { ...process.env, HERMES_CONFIG_DIR: join(dir, 'cfg') },
});
const pkg = JSON.parse(readFileSync(join(dir, 'tienda', 'package.json'), 'utf8'));
if (pkg.name !== 'tienda') throw new Error(`name: ${pkg.name}`);
if (String(pkg.dependencies['@hermesecommerce/storefront']).startsWith('file:')) throw new Error('quedó un file:');
if (!/^\^\d/.test(String(pkg.devDependencies?.['@hermesecommerce/cli'])))
  throw new Error(`la CLI no viaja como devDependency publicada: ${pkg.devDependencies?.['@hermesecommerce/cli']}`);
for (const f of ['app/layout.tsx', '.gitignore', '.env.example'])
  if (!existsSync(join(dir, 'tienda', f))) throw new Error(`falta ${f}`);
for (const f of ['.env', 'node_modules', '_npmrc', '_gitignore'])
  if (existsSync(join(dir, 'tienda', f))) throw new Error(`se copió ${f}`);
const npmrc = readFileSync(join(dir, 'tienda', '.npmrc'), 'utf8');
if (!/^legacy-peer-deps=true$/m.test(npmrc) || npmrc.includes('install-links'))
  throw new Error(`.npmrc inesperado:\n${npmrc}`);

console.log(`smoke OK (node ${process.versions.node})`);

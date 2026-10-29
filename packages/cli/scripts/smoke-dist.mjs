// Corre el binario buildeado (dist/index.js) con la versión de Node actual:
// en CI, también con Node 18 (el mínimo soportado).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const primera = readFileSync(bin, 'utf8').split('\n')[0];
if (primera !== '#!/usr/bin/env node') throw new Error(`sin shebang: ${primera}`);

const ayuda = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
if (!ayuda.includes('hermes login') && !ayuda.includes('Uso: hermes'))
  throw new Error(`--help inesperado:\n${ayuda}`);

const version = execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }).trim();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (version !== pkg.version) throw new Error(`--version ${version} ≠ ${pkg.version}`);

let codigo = 0;
try {
  execFileSync(process.execPath, [bin, 'nada'], { stdio: 'pipe' });
} catch (e) {
  codigo = e.status;
}
if (codigo !== 2) throw new Error(`comando desconocido salió con ${codigo}`);

console.log(`smoke OK (node ${process.versions.node})`);

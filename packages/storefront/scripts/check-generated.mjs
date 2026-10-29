// Falla si src/generated/schema.d.ts (openapi-typescript) o
// src/generated/cache.ts (scripts/generate-cache.mjs) no coinciden con lo que
// se genera desde openapi.yaml.
// Arreglo: `npm run generate` y commitear.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generarCache } from './generate-cache.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const yaml = join(raiz, 'openapi.yaml');
const generado = join(raiz, 'src/generated/schema.d.ts');
const tmp = join(mkdtempSync(join(tmpdir(), 'hermes-sdk-')), 'schema.d.ts');
const bin = join(raiz, 'node_modules/.bin/openapi-typescript');

execFileSync(bin, [yaml, '-o', tmp], { stdio: 'pipe' });
if (readFileSync(tmp, 'utf8') !== readFileSync(generado, 'utf8')) {
  console.error(
    'src/generated/schema.d.ts está desactualizado respecto de openapi.yaml.\n' +
      'Corré `npm run generate` en packages/storefront y commiteá el resultado.',
  );
  process.exit(1);
}
if (generarCache() !== readFileSync(join(raiz, 'src/generated/cache.ts'), 'utf8')) {
  console.error(
    'src/generated/cache.ts está desactualizado respecto de openapi.yaml.\n' +
      'Corré `npm run generate` en packages/storefront y commiteá el resultado.',
  );
  process.exit(1);
}
console.log('Tipos y caché generados al día con la OpenAPI.');

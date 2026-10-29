// Genera src/generated/cache.ts desde las extensiones de caché de la OpenAPI
// (`x-cache-tags`, `x-cache-ttl` por operación GET y `x-cache-ttl-seconds` en
// la raíz). Lo corre `npm run generate`; `npm run check:generated` falla si
// quedó viejo. No editar el generado a mano.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

export function generarCache(specPath = join(raiz, 'openapi.yaml')) {
  const doc = yaml.load(readFileSync(specPath, 'utf8'));
  const ttls = doc['x-cache-ttl-seconds'] ?? {};
  const ops = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const op = item?.get;
    if (!op?.operationId || op['x-cache-ttl'] === undefined) continue;
    ops.push({
      id: op.operationId,
      path,
      tags: op['x-cache-tags'] ?? [],
      ttl: op['x-cache-ttl'],
    });
  }
  ops.sort((a, b) => a.id.localeCompare(b.id));
  const lineas = [
    '// GENERADO por scripts/generate-cache.mjs desde openapi.yaml.',
    '// No editar a mano: `npm run generate`.',
    '',
    '/** Segundos de cada perfil de `x-cache-ttl`. */',
    `export const CACHE_TTL_SECONDS = ${JSON.stringify(ttls)} as const;`,
    '',
    '/**',
    ' * Caché de cada GET del storefront: tags (plantillas `{param}`) y TTL',
    " * sugerido (`'none'` = no cachear). Clave = operationId de la spec.",
    ' */',
    'export const CACHE_OPERATIONS = {',
    ...ops.map(
      (o) =>
        `  ${o.id}: { path: ${JSON.stringify(o.path)}, tags: ${JSON.stringify(o.tags)}, ttl: ${JSON.stringify(o.ttl)} },`,
    ),
    '} as const;',
    '',
  ];
  return lineas.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destino = join(raiz, 'src/generated/cache.ts');
  writeFileSync(destino, generarCache());
  console.log(`Caché de operaciones → ${destino}`);
}

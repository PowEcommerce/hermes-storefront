import { cp, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

/**
 * Lo que NUNCA se copia del starter a una tienda nueva: dependencias y build
 * locales, secretos, el link a la marca de quien lo armó y el lockfile del
 * repo (apunta al SDK local con file:).
 */
const EXCLUIR_DIRS = new Set(['node_modules', '.next', '.hermes', '.vercel', '.open-next', '.wrangler', 'out', '.turbo']);
const EXCLUIR_ARCHIVOS = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'next-env.d.ts', '.npmrc', '.DS_Store']);

export function seCopia(rel: string): boolean {
  const partes = rel.split(sep).join('/').split('/');
  if (partes.some((p) => EXCLUIR_DIRS.has(p))) return false;
  const nombre = partes[partes.length - 1];
  if (EXCLUIR_ARCHIVOS.has(nombre)) return false;
  if (nombre.endsWith('.tsbuildinfo')) return false;
  // .env, .env.local, .env.production… sí; .env.example no.
  if (/^\.env(\..+)?$/.test(nombre) && nombre !== '.env.example') return false;
  return true;
}

/**
 * El `.npmrc` de una tienda nueva. No es el del starter del repo (ese lleva
 * `install-links`, que sólo sirve para los `file:` de adentro del repo y no se copia).
 */
export const NPMRC_TIENDA = `# npm 10 (Node 20/22) falla con vitest 4 al resolver peer dependencies
# («Cannot read properties of null (reading 'edgesOut')»). Con esto instala
# bien; npm 11 no lo necesita. Las peers que hacen falta están declaradas
# explícitamente en package.json.
legacy-peer-deps=true
`;

/**
 * Copia `origen` en `destino` sin lo de `seCopia`. `.gitignore` y `.npmrc` viajan
 * como `_gitignore` y `_npmrc` en el paquete publicado (npm los borra al publicar)
 * y vuelven a su nombre al crear la tienda. El `.npmrc` es siempre `NPMRC_TIENDA`.
 */
export async function copiarTemplate(
  origen: string,
  destino: string,
  opts: { gitignoreComo?: '_gitignore' | '.gitignore' } = {},
): Promise<void> {
  await cp(origen, destino, {
    recursive: true,
    filter: (src) => {
      const rel = relative(origen, src);
      return rel === '' || seCopia(rel);
    },
  });
  const como = opts.gitignoreComo ?? '.gitignore';
  const otro = como === '.gitignore' ? '_gitignore' : '.gitignore';
  const desde = join(destino, otro);
  if (await existe(desde)) await rename(desde, join(destino, como));

  // _npmrc en el template publicado; .npmrc en la tienda (si el template no lo
  // trae, como el starter/ del repo, se escribe NPMRC_TIENDA).
  if (como === '_gitignore') await writeFile(join(destino, '_npmrc'), NPMRC_TIENDA);
  else if (await existe(join(destino, '_npmrc'))) await rename(join(destino, '_npmrc'), join(destino, '.npmrc'));
  else await writeFile(join(destino, '.npmrc'), NPMRC_TIENDA);
}

export async function existe(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** ¿La carpeta no existe o está vacía (ignorando .git y .DS_Store)? */
export async function carpetaLibre(p: string): Promise<boolean> {
  try {
    const items = await readdir(p);
    return items.every((x) => x === '.git' || x === '.DS_Store');
  } catch {
    return true;
  }
}

export const nombreDeCarpeta = (p: string) => basename(p);

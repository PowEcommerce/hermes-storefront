import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { CliError } from './errors';

/**
 * El bundle que sube `hermes deploy`: la salida de
 * `opennextjs-cloudflare build` empaquetada por
 * `wrangler deploy --dry-run --outdir` (módulos del worker) + la carpeta de
 * assets. Así lo despliega la API en Workers for Platforms.
 */

/** Lo que `hermes deploy` lee de wrangler.jsonc / wrangler.json. */
export interface ConfigWrangler {
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
  assetsDir: string | null;
}

export const ARCHIVOS_WRANGLER = ['wrangler.jsonc', 'wrangler.json'];

/** JSON con comentarios (// y /* *\/) y comas finales, como wrangler.jsonc. */
export function parseJsonc(texto: string): unknown {
  let out = '';
  let enString = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enString) {
      out += c;
      if (c === '\\') out += texto[++i] ?? '';
      else if (c === '"') enString = false;
    } else if (c === '"') {
      enString = true;
      out += c;
    } else if (c === '/' && texto[i + 1] === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && texto[i + 1] === '*') {
      i += 2;
      while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export async function leerConfigWrangler(cwd: string): Promise<ConfigWrangler | null> {
  for (const archivo of ARCHIVOS_WRANGLER) {
    let texto: string;
    try {
      texto = await readFile(join(cwd, archivo), 'utf8');
    } catch {
      continue;
    }
    let c: Record<string, any>;
    try {
      c = parseJsonc(texto) as Record<string, any>;
    } catch (e) {
      throw new CliError(`No pude leer ${archivo}: ${(e as Error).message}`);
    }
    if (typeof c.main !== 'string') throw new CliError(`${archivo}: falta "main" (en OpenNext: ".open-next/worker.js")`);
    if (typeof c.compatibility_date !== 'string')
      throw new CliError(`${archivo}: falta "compatibility_date"`);
    return {
      main: c.main,
      compatibility_date: c.compatibility_date,
      compatibility_flags: Array.isArray(c.compatibility_flags) ? c.compatibility_flags.map(String) : [],
      assetsDir: typeof c.assets?.directory === 'string' ? c.assets.directory : null,
    };
  }
  return null;
}

/** Todos los archivos de una carpeta (rutas relativas con /). */
async function archivos(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entradas;
    try {
      entradas = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'));
    }
  }
  await walk(dir);
  return out.sort();
}

const TIPO_DE_MODULO: Record<string, string> = {
  '.js': 'esm',
  '.mjs': 'esm',
  '.cjs': 'cjs',
  '.wasm': 'wasm',
  '.txt': 'text',
  '.html': 'text',
  '.sql': 'text',
  '.bin': 'data',
};

export interface Modulo {
  name: string;
  type: string;
  size: number;
  sha256: string;
  path: string;
}

/** Los módulos que dejó `wrangler deploy --dry-run --outdir` (sin source maps ni README). */
export async function modulosDelWorker(outdir: string, main: string): Promise<{ main: string; modulos: Modulo[] }> {
  const lista = (await archivos(outdir)).filter((f) => !f.endsWith('.map') && f !== 'README.md');
  if (!lista.length) throw new CliError(`El build no dejó el worker en ${outdir}.`);
  const modulos: Modulo[] = [];
  for (const name of lista) {
    const path = join(outdir, name);
    const b = await readFile(path);
    modulos.push({
      name,
      type: TIPO_DE_MODULO[extname(name).toLowerCase()] ?? 'data',
      size: b.length,
      sha256: createHash('sha256').update(b).digest('hex'),
      path,
    });
  }
  const candidatos = [basename(main).replace(/\.(ts|mts|tsx)$/, '.js'), 'index.js', 'worker.js'];
  const principal = candidatos.find((c) => modulos.some((m) => m.name === c));
  if (!principal) throw new CliError(`No encontré el módulo principal del worker en ${outdir}.`);
  return { main: principal, modulos };
}

/**
 * Hash de un asset como lo pide Cloudflare (direct upload): sha256 del
 * contenido en base64 + la extensión, 32 hex. La API lo verifica igual.
 */
export function hashDeAsset(content: Buffer, ruta: string): string {
  const ext = /\.([^./]+)$/.exec(ruta)?.[1] ?? '';
  return createHash('sha256')
    .update(content.toString('base64') + ext)
    .digest('hex')
    .slice(0, 32);
}

export interface Assets {
  manifest: Record<string, { hash: string; size: number }>;
  /** hash → archivo local */
  porHash: Map<string, string>;
}

export const MAX_BYTES_ASSET = 25 * 1024 * 1024;

/** Manifest de assets (ruta pública → hash + tamaño). Sin archivos ocultos. */
export async function assetsDe(dir: string): Promise<Assets> {
  const manifest: Assets['manifest'] = {};
  const porHash = new Map<string, string>();
  for (const rel of await archivos(dir)) {
    if (rel.split('/').some((s) => s.startsWith('.'))) continue;
    const path = join(dir, rel);
    const st = await stat(path);
    if (st.size > MAX_BYTES_ASSET) throw new CliError(`${rel} pesa más de 25 MiB (límite de Cloudflare por asset).`);
    const b = await readFile(path);
    const ruta = `/${rel}`;
    const hash = hashDeAsset(b, ruta);
    manifest[ruta] = { hash, size: b.length };
    if (!porHash.has(hash)) porHash.set(hash, path);
  }
  return { manifest, porHash };
}

/** La branch de git (leyendo .git/HEAD), o null. */
export async function branchDeGit(cwd: string): Promise<string | null> {
  try {
    const head = (await readFile(join(cwd, '.git', 'HEAD'), 'utf8')).trim();
    const m = /^ref: refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Configs por default para Next.js con @opennextjs/cloudflare (las mismas que trae el starter). */
export const OPEN_NEXT_CONFIG = `// Config de @opennextjs/cloudflare para \`hermes deploy\` (hosting de Hermes).
// Sin caché incremental persistente: los datos de Hermes se cachean con sus
// tags y TTL. Ver https://opennext.js.org/cloudflare
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
`;

export const WRANGLER_JSONC = `// Config mínima para \`hermes deploy\`: el build de @opennextjs/cloudflare.
// No hace falta una cuenta de Cloudflare: Hermes despliega en la de Pow.
// Las variables HERMES_* las pone el hosting (no las cargues acá).
{
  "name": "hermes-store",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" }
}
`;

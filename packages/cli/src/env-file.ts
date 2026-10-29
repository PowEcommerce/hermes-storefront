import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Las variables que escribe `hermes link` (y borra `hermes unlink`). */
export const VARIABLES_HERMES = [
  'HERMES_TENANT',
  'HERMES_API_URL',
  'HERMES_PUBLIC_TOKEN',
  'HERMES_PRIVATE_TOKEN',
  'HERMES_REVALIDATE_SECRET',
] as const;

const MARCA = '# Hermes (escrito por `hermes link`)';
const LINEA = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

async function leer(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function formatear(valor: string): string {
  return /^[A-Za-z0-9_\-./:@+]*$/.test(valor) ? valor : JSON.stringify(valor);
}

/** El valor de una variable en un .env (sin comillas), o undefined. */
export function leerVariable(contenido: string, nombre: string): string | undefined {
  for (const l of contenido.split(/\r?\n/)) {
    const m = LINEA.exec(l);
    if (m?.[1] !== nombre) continue;
    let v = l.slice(l.indexOf('=') + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    return v;
  }
  return undefined;
}

/**
 * Escribe/actualiza variables en el texto de un .env sin tocar el resto
 * (otras variables, comentarios, orden). `undefined` borra la variable.
 * Una variable que ya estaba se reemplaza en su lugar; las nuevas van al
 * final, bajo un comentario de la CLI.
 */
export function actualizarEnv(
  contenido: string,
  cambios: Record<string, string | undefined>,
): string {
  const lineas = contenido.split(/\r?\n/);
  if (lineas[lineas.length - 1] === '') lineas.pop();
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const l of lineas) {
    const m = LINEA.exec(l);
    if (!m || !(m[1] in cambios)) {
      salida.push(l);
      continue;
    }
    // Duplicados de una variable que se toca: queda una sola.
    if (vistas.has(m[1])) continue;
    vistas.add(m[1]);
    const v = cambios[m[1]];
    if (v !== undefined) salida.push(`${m[1]}=${formatear(v)}`);
  }
  const nuevas = Object.entries(cambios).filter(
    ([k, v]) => v !== undefined && !vistas.has(k),
  );
  if (nuevas.length) {
    if (salida.length && salida[salida.length - 1].trim() !== '')
      salida.push('');
    if (!salida.includes(MARCA)) salida.push(MARCA);
    for (const [k, v] of nuevas) salida.push(`${k}=${formatear(v!)}`);
  }
  // Sin variables de Hermes, el comentario de la CLI sobra.
  const quedanHermes = salida.some((l) =>
    (VARIABLES_HERMES as readonly string[]).includes(LINEA.exec(l)?.[1] ?? ''),
  );
  const final = quedanHermes ? salida : salida.filter((l) => l !== MARCA);
  while (final.length && final[final.length - 1].trim() === '') final.pop();
  return final.length ? `${final.join('\n')}\n` : '';
}

/** Aplica `cambios` al .env de `dir` (lo crea con permisos 600 si no existe). */
export async function escribirEnv(
  dir: string,
  cambios: Record<string, string | undefined>,
  archivo = '.env',
): Promise<string> {
  const path = join(dir, archivo);
  const antes = await leer(path);
  await writeFile(path, actualizarEnv(antes ?? '', cambios), {
    mode: 0o600,
  });
  if (antes === null) await chmod(path, 0o600).catch(() => undefined);
  return path;
}

/** Todas las variables de un .env (nombre → valor sin comillas). */
export function todasLasVariables(contenido: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of contenido.split(/\r?\n/)) {
    const m = LINEA.exec(l);
    if (!m) continue;
    const v = leerVariable(l, m[1]);
    if (v !== undefined) out[m[1]] = v;
  }
  return out;
}

export async function leerEnv(dir: string, archivo = '.env'): Promise<string> {
  return (await leer(join(dir, archivo))) ?? '';
}

/** ¿Este .gitignore ya ignora `.env`? (las formas comunes) */
export function ignoraEnv(gitignore: string): boolean {
  return gitignore
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => ['.env', '/.env', '.env*', '/.env*', '*.env', '**/.env'].includes(l));
}

/** Agrega `.env` al .gitignore de `dir` si no lo ignora. true si lo agregó. */
export async function asegurarGitignore(dir: string): Promise<boolean> {
  const path = join(dir, '.gitignore');
  const actual = (await leer(path)) ?? '';
  if (ignoraEnv(actual)) return false;
  const sep = actual === '' || actual.endsWith('\n') ? '' : '\n';
  await writeFile(path, `${actual}${sep}.env\n`);
  return true;
}

/**
 * Agrega una línea al .gitignore si no está (p. ej. `.hermes/build/`, el
 * worker empaquetado de `hermes deploy`). Devuelve si la agregó.
 */
export async function ignorarEnGit(dir: string, linea: string): Promise<boolean> {
  const path = join(dir, '.gitignore');
  const actual = (await leer(path)) ?? '';
  const base = linea.replace(/\/$/, '');
  if (actual.split(/\r?\n/).some((l) => [linea, base, `/${linea}`, `/${base}`].includes(l.trim()))) return false;
  const sep = actual === '' || actual.endsWith('\n') ? '' : '\n';
  await writeFile(path, `${actual}${sep}${linea}\n`);
  return true;
}

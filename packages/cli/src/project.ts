import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * `.hermes/project.json`: a qué marca y proyecto está linkeada esta carpeta.
 * Sin secretos ni nada personal: se commitea y lo comparte el equipo (y el
 * CI). Los tokens (personales) van sólo al .env de cada uno.
 */
export interface Proyecto {
  tenant: string;
  project_name: string;
  api: string;
  /** De versiones anteriores (los ids de los tokens del link): ya no se usan. */
  public_token_id?: number;
  private_token_id?: number | null;
  linked_at: string;
}

const DIR = '.hermes';
const ARCHIVO = 'project.json';

export async function leerProyecto(cwd: string): Promise<Proyecto | null> {
  try {
    return JSON.parse(
      await readFile(join(cwd, DIR, ARCHIVO), 'utf8'),
    ) as Proyecto;
  } catch {
    return null;
  }
}

export async function guardarProyecto(cwd: string, p: Proyecto): Promise<void> {
  await mkdir(join(cwd, DIR), { recursive: true });
  await writeFile(join(cwd, DIR, ARCHIVO), `${JSON.stringify(p, null, 2)}\n`);
}

export async function borrarProyecto(cwd: string): Promise<void> {
  await rm(join(cwd, DIR, ARCHIVO), { force: true });
  // La carpeta sólo si quedó vacía.
  await rmdir(join(cwd, DIR)).catch(() => undefined);
}

/** Nombre por default del proyecto: el `name` del package.json o la carpeta. */
export async function nombrePorDefecto(cwd: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
      name?: unknown;
    };
    if (typeof pkg.name === 'string' && pkg.name.trim())
      return pkg.name.replace(/^@[^/]+\//, '').slice(0, 60);
  } catch {
    // sin package.json
  }
  return basename(cwd).slice(0, 60) || 'storefront';
}

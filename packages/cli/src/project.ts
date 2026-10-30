import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

/**
 * Como el slug de proyecto de la API (`Tienda Nueva!` → `tienda-nueva`): el
 * nombre con el que el hosting y los tokens guardan el proyecto.
 */
export function slugDeProyecto(v: string): string {
  return v
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'storefront';
}

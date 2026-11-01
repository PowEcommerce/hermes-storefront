import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_DEFAULT, esApiDefault } from './context';

/**
 * `.hermes/project.json`: a qué marca y proyecto está linkeada esta carpeta.
 * Sin secretos ni nada personal: se commitea y lo comparte el equipo (y el
 * CI). Los tokens (personales) van sólo al .env de cada uno.
 */
export interface Proyecto {
  tenant: string;
  project_name: string;
  /** La API; en el archivo sólo si no es la de Hermes (desarrollo interno). */
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
    const p = JSON.parse(
      await readFile(join(cwd, DIR, ARCHIVO), 'utf8'),
    ) as Proyecto;
    return { ...p, api: p.api || API_DEFAULT };
  } catch {
    return null;
  }
}

export async function guardarProyecto(cwd: string, p: Proyecto): Promise<void> {
  await mkdir(join(cwd, DIR), { recursive: true });
  // La API de Hermes no se escribe (es el default al leer): el archivo se
  // commitea y no tiene por qué llevar la URL.
  const { api, ...resto } = p;
  const archivo = esApiDefault(api) ? resto : p;
  await writeFile(join(cwd, DIR, ARCHIVO), `${JSON.stringify(archivo, null, 2)}\n`);
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

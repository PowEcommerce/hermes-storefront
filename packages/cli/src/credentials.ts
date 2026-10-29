import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_DEFAULT } from './context';
import { CliError } from './errors';

export interface Sesion {
  token: string;
  email: string;
  name?: string;
  expires_at: string;
  created_at: string;
}

interface Archivo {
  default_api?: string;
  sessions: Record<string, Sesion>;
}

const ARCHIVO = 'credentials.json';

/** "https://api.pow.la/api/" → "https://api.pow.la" (la CLI agrega /api). */
export function normalizarApi(valor: string): string {
  let v = valor.trim().replace(/\/+$/, '');
  if (v.endsWith('/api')) v = v.slice(0, -4);
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new CliError(`--api: "${valor}" no es una URL`);
  }
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:'))
    throw new CliError('--api: tiene que ser https (http sólo para localhost)');
  return v;
}

/**
 * ~/.config/hermes/credentials.json, permisos 600 (carpeta 700). Una sesión
 * por API (producción, otra API, local), y la última usada como default.
 */
export class CredentialsStore {
  constructor(private readonly dir: string) {}

  get path(): string {
    return join(this.dir, ARCHIVO);
  }

  async leer(): Promise<Archivo> {
    try {
      const j = JSON.parse(await readFile(this.path, 'utf8')) as Archivo;
      return { default_api: j.default_api, sessions: j.sessions ?? {} };
    } catch {
      return { sessions: {} };
    }
  }

  private async escribir(a: Archivo): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify(a, null, 2)}\n`, {
      mode: 0o600,
    });
    // Si el archivo ya existía con otros permisos, writeFile no los cambia.
    await chmod(this.path, 0o600).catch(() => undefined);
  }

  /** La API a usar: la del flag, la de HERMES_API, la última usada o prod. */
  async api(flag: string | undefined, env: Record<string, string | undefined>) {
    if (flag) return normalizarApi(flag);
    if (env.HERMES_API) return normalizarApi(env.HERMES_API);
    return (await this.leer()).default_api ?? API_DEFAULT;
  }

  async sesion(api: string): Promise<Sesion | null> {
    const s = (await this.leer()).sessions[api];
    if (!s) return null;
    if (Date.parse(s.expires_at) <= Date.now()) return null;
    return s;
  }

  async guardar(api: string, s: Sesion): Promise<void> {
    const a = await this.leer();
    a.sessions[api] = s;
    a.default_api = api;
    await this.escribir(a);
  }

  async borrar(api: string): Promise<boolean> {
    const a = await this.leer();
    if (!a.sessions[api]) return false;
    delete a.sessions[api];
    if (a.default_api === api) delete a.default_api;
    if (!Object.keys(a.sessions).length && !a.default_api)
      await rm(this.path, { force: true });
    else await this.escribir(a);
    return true;
  }
}

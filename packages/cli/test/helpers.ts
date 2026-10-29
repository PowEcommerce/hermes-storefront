import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ctx } from '../src/context';

export interface Llamada {
  method: string;
  path: string;
  body: any;
  auth: string | null;
  userAgent: string | null;
}

type Handler = (c: Llamada) => { status?: number; body: unknown } | undefined;

/** fetch falso: registra cada llamada y responde con `handler`. */
export function apiFalsa(handler: Handler) {
  const llamadas: Llamada[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const c: Llamada = {
      method: init.method ?? 'GET',
      path: u.pathname + u.search,
      body:
        init.body instanceof FormData
          ? init.body
          : init.body
            ? JSON.parse(String(init.body))
            : undefined,
      auth: headers.authorization ?? null,
      userAgent: headers['user-agent'] ?? headers['User-Agent'] ?? null,
    };
    llamadas.push(c);
    const r = handler(c) ?? { status: 404, body: { error: 'no mockeado' } };
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, llamadas };
}

export async function ctxDePrueba(
  fetch: typeof globalThis.fetch,
  opts: { respuestas?: string[]; interactive?: boolean; codigos?: number[] } = {},
) {
  const procesos: { cmd: string; args: string[]; cwd: string; env: Record<string, string | undefined> }[] = [];
  const codigos = [...(opts.codigos ?? [])];
  const cwd = await mkdtemp(join(tmpdir(), 'hermes-cwd-'));
  const configDir = join(await mkdtemp(join(tmpdir(), 'hermes-cfg-')), 'hermes');
  const out: string[] = [];
  const err: string[] = [];
  const respuestas = [...(opts.respuestas ?? [])];
  const esperas: number[] = [];
  const abiertos: string[] = [];
  const ctx: Ctx = {
    cwd,
    configDir,
    env: {},
    fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: opts.interactive ?? false,
    ask: (p) => {
      out.push(p);
      return Promise.resolve(respuestas.shift() ?? '');
    },
    openBrowser: (url) => {
      abiertos.push(url);
      return Promise.resolve(true);
    },
    sleep: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
    clientName: 'hermes-cli test',
    spawn: (cmd, args, o) => {
      procesos.push({ cmd, args, cwd: o.cwd, env: o.env });
      return Promise.resolve(codigos.shift() ?? 0);
    },
  };
  return { ctx, out, err, esperas, abiertos, cwd, configDir, procesos };
}

export const SESION = {
  token: 'hct_' + 'a'.repeat(40),
  email: 'ana@agencia.com',
  name: 'Ana',
  expires_at: new Date(Date.now() + 86400_000).toISOString(),
  created_at: new Date().toISOString(),
};

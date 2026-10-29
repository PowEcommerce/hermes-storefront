import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { EventoDeLog } from '../src/api';
import { MAX_TAIL_MS, SONDEO_MS, agrupar, lineaDe } from '../src/commands/logs';
import { Llamada, SESION, apiFalsa, ctxDePrueba } from './helpers';

const BASE = '/api/cli/tenants/mimarca/logs';

const ev = (o: Partial<EventoDeLog>): EventoDeLog => ({
  timestamp: '2026-10-29T15:00:00.000Z',
  request_id: 'r1',
  type: 'request',
  level: null,
  method: 'GET',
  path: '/productos/remera',
  status: 200,
  outcome: 'ok',
  message: null,
  error: null,
  duration_ms: 42,
  ...o,
});

/** La API de logs: devuelve `tandas` en orden (la última se repite). */
function apiDeLogs(tandas: EventoDeLog[][], opts: { status?: number; body?: unknown } = {}) {
  let i = 0;
  return apiFalsa((c: Llamada) => {
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    if (!c.path.startsWith(BASE)) return undefined;
    if (opts.status) return { status: opts.status, body: opts.body ?? { error: 'x' } };
    const events = tandas[Math.min(i++, tandas.length - 1)] ?? [];
    return {
      body: {
        project: 'tienda',
        environment: 'production',
        branch: null,
        from: '2026-10-29T14:59:00.000Z',
        to: new Date().toISOString(),
        events,
        truncated: false,
      },
    };
  });
}

async function linkeado(api: ReturnType<typeof apiFalsa>, git?: string) {
  const t = await ctxDePrueba(api.fetch);
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  await mkdir(join(t.cwd, '.hermes'), { recursive: true });
  await writeFile(
    join(t.cwd, '.hermes', 'project.json'),
    JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', linked_at: 'x' }),
  );
  if (git) {
    await mkdir(join(t.cwd, '.git'), { recursive: true });
    await writeFile(join(t.cwd, '.git', 'HEAD'), `ref: refs/heads/${git}\n`);
  }
  return t;
}

const params = (c: Llamada) => Object.fromEntries(new URL(`https://x${c.path}`).searchParams);

describe('hermes logs', () => {
  it('--no-follow --since 1h: una consulta, salida legible agrupada por pedido', async () => {
    const api = apiDeLogs([
      [
        ev({ type: 'log', level: 'log', message: 'hola desde el server', method: null, path: null, status: null, outcome: null }),
        ev({}),
        ev({ request_id: 'r2', status: 500, outcome: 'exception', path: '/checkout' }),
        ev({ request_id: 'r2', type: 'log', level: 'error', message: 'falló el CMS', method: null, path: null, status: null, outcome: null }),
      ],
    ]);
    const t = await linkeado(api);
    expect(await main(['logs', '--since', '1h', '--no-follow'], t.ctx)).toBe(0);
    expect(api.llamadas).toHaveLength(1);
    expect(params(api.llamadas[0])).toEqual({ project: 'tienda', environment: 'production', since: '1h', limit: '200' });
    // Nunca habló con Cloudflare.
    expect(api.llamadas.every((c) => c.path.startsWith('/api/cli/'))).toBe(true);
    const lineas = t.out;
    expect(lineas[0]).toMatch(/^\s+\d\d:\d\d:\d\d\s+GET\s+200\s+\/productos\/remera\s+42 ms$/);
    expect(lineas[1]).toMatch(/│ log\s+hola desde el server$/);
    expect(lineas[2]).toMatch(/^✘ .*GET\s+500\s+\/checkout.*\(exception\)/);
    expect(lineas[3]).toMatch(/^✘ .*│ error falló el CMS$/);
    expect(t.esperas).toEqual([]);
  });

  it('en vivo: sondea cada 3 s sin repetir eventos y corta a los 15 minutos', async () => {
    const a = ev({ request_id: 'a' });
    const b = ev({ request_id: 'b', timestamp: '2026-10-29T15:00:05.000Z' });
    const api = apiDeLogs([[a], [a, b], [b]]);
    const t = await linkeado(api);
    expect(await main(['logs', '--status', 'error', '--search', 'cms'], t.ctx)).toBe(0);
    const vueltas = MAX_TAIL_MS / SONDEO_MS;
    expect(t.esperas).toHaveLength(vueltas);
    expect(t.esperas.every((ms) => ms === SONDEO_MS)).toBe(true);
    expect(api.llamadas).toHaveLength(vueltas + 1);
    expect(params(api.llamadas[0])).toMatchObject({ since: '1m', status: 'error', search: 'cms' });
    // Los siguientes piden desde el último `to` (con solape), en ISO.
    expect(params(api.llamadas[1]).since).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(t.out).toHaveLength(2); // a y b, una vez cada uno
    expect(t.err.join('\n')).toMatch(/en vivo, Ctrl\+C/);
    expect(t.err.join('\n')).toMatch(/Pasaron 15 minutos/);
  });

  it('--preview usa la branch de git (o --branch); --json: un evento por línea', async () => {
    const api = apiDeLogs([[ev({})]]);
    const t = await linkeado(api, 'feat/home');
    expect(await main(['logs', '--preview', '--no-follow', '--json'], t.ctx)).toBe(0);
    expect(params(api.llamadas[0])).toMatchObject({ environment: 'preview', branch: 'feat/home' });
    expect(JSON.parse(t.out[0])).toMatchObject({ request_id: 'r1', status: 200 });
    expect(t.err).toEqual([]);
    const u = await linkeado(apiDeLogs([[]]));
    expect(await main(['logs', '--preview', '--no-follow'], u.ctx)).toBe(1);
    expect(u.err.join('\n')).toMatch(/--branch/);
  });

  it('valida --status y --since; API vieja → mensaje claro; 429 → tope de la sesión', async () => {
    const t = await linkeado(apiDeLogs([[]]));
    expect(await main(['logs', '--status', 'warn'], t.ctx)).toBe(1);
    expect(await main(['logs', '--since', 'ayer'], t.ctx)).toBe(1);
    const vieja = await linkeado(
      apiDeLogs([], { status: 404, body: { message: 'Cannot GET /api/cli/tenants/mimarca/logs', error: 'Not Found', statusCode: 404 } }),
    );
    expect(await main(['logs'], vieja.ctx)).toBe(1);
    expect(vieja.err.join('\n')).toMatch(/todavía no tiene `hermes logs`/);
    const tope = await linkeado(apiDeLogs([], { status: 429, body: { error: 'Demasiados intentos.' } }));
    expect(await main(['logs'], tope.ctx)).toBe(1);
    expect(tope.err.join('\n')).toMatch(/tope de pedidos de logs/);
    const sinDeploy = await linkeado(apiDeLogs([], { status: 404, body: { error: '"tienda" no tiene deploys en producción (`hermes deploy`)' } }));
    expect(await main(['logs'], sinDeploy.ctx)).toBe(1);
    expect(sinDeploy.err.join('\n')).toMatch(/Error \(404\): "tienda" no tiene deploys/);
  });

  it('agrupar / lineaDe', () => {
    const l = ev({ type: 'log', level: 'warn', message: 'ojo', request_id: 'x', status: null, method: null, path: null });
    const r = ev({ request_id: 'x', timestamp: '2026-10-29T15:00:01.000Z' });
    expect(agrupar([l, r])).toEqual([r, l]);
    expect(lineaDe(ev({ status: null, outcome: 'exceededCpu', duration_ms: null }))).toMatch(/✘ .*exceededCpu/);
  });
});

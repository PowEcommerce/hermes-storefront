import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { Llamada, SESION, apiFalsa, ctxDePrueba } from './helpers';

const PST = 'pst_' + '1'.repeat(40);
const BASE = '/api/cli/tenants/mimarca';

/** La API con `…/env`: guarda en memoria, como la de Hermes (las secretas, sin valor). */
function apiDeVariables(opts: { vieja?: boolean; sinPlan?: boolean } = {}) {
  const vars: Array<{ name: string; environment: string; is_secret: boolean; value: string }> = [];
  const formato = (v: (typeof vars)[number]) => ({
    name: v.name,
    environment: v.environment,
    is_secret: v.is_secret,
    value: v.is_secret ? null : v.value,
    updated_by: SESION.email,
    updated_at: '2026-10-29T12:00:00Z',
  });
  const a = apiFalsa((c: Llamada) => {
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    if (c.path === `${BASE}/tokens`)
      return {
        body: {
          storefront_tokens: [
            { id: 1, name: 'CLI', token_prefix: PST.slice(0, 12), kind: 'public', revoked_at: null, created_by: SESION.email, created_at: 'x' },
          ],
        },
      };
    if (!c.path.startsWith(`${BASE}/env`)) return undefined;
    if (opts.vieja) return { status: 404, body: { message: `Cannot ${c.method} ${c.path.split('?')[0]}`, error: 'Not Found', statusCode: 404 } };
    if (opts.sinPlan) return { status: 403, body: { error: 'hosting_no_habilitado', message: 'El plan de mimarca no incluye el hosting de Hermes.' } };
    const u = new URL(`https://x${c.path}`);
    if (c.method === 'GET') {
      const env = u.searchParams.get('environment');
      return {
        body: {
          project: u.searchParams.get('project'),
          environment: env,
          env: vars.filter((v) => !env || v.environment === env).map(formato),
        },
      };
    }
    if (c.method === 'PUT') {
      const previa = vars.find((v) => v.name === c.body.name && v.environment === c.body.environment);
      if (previa) Object.assign(previa, { value: c.body.value, is_secret: c.body.secret });
      else vars.push({ name: c.body.name, environment: c.body.environment, is_secret: c.body.secret, value: c.body.value });
      const v = vars.find((x) => x.name === c.body.name && x.environment === c.body.environment)!;
      return { body: { success: true, created: !previa, var: formato(v), message: 'Se aplica en el próximo `hermes deploy`.' } };
    }
    if (c.method === 'DELETE') {
      const name = decodeURIComponent(u.pathname.split('/').pop()!);
      const env = u.searchParams.get('environment');
      const i = vars.findIndex((v) => v.name === name && v.environment === env);
      if (i < 0) return { status: 404, body: { error: `${name} no existe en ${env}` } };
      vars.splice(i, 1);
      return { body: { success: true, removed: { name, project: u.searchParams.get('project'), environment: env } } };
    }
    return undefined;
  });
  return { ...a, vars };
}

async function linkeado(opts: Parameters<typeof apiDeVariables>[0] & { interactive?: boolean; respuestas?: string[] } = {}) {
  const api = apiDeVariables(opts);
  const t = await ctxDePrueba(api.fetch, { interactive: opts.interactive, respuestas: opts.respuestas });
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  await mkdir(join(t.cwd, '.hermes'), { recursive: true });
  await writeFile(
    join(t.cwd, '.hermes', 'project.json'),
    JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', linked_at: 'x' }),
  );
  await writeFile(join(t.cwd, '.env'), `HERMES_TENANT=mimarca\nHERMES_PUBLIC_TOKEN=${PST}\nMIA=local\n`);
  return { t, api };
}

describe('hermes env', () => {
  it('set (normal y --secret) → list con las secretas enmascaradas; avisa que se aplica en el próximo deploy', async () => {
    const { t, api } = await linkeado();
    expect(await main(['env', 'set', 'NEXT_PUBLIC_GA_ID=G-123'], t.ctx)).toBe(0);
    expect(await main(['env', 'set', 'CMS_TOKEN=s3cr3t-valor=con-igual', '--secret'], t.ctx)).toBe(0);
    expect(await main(['env', 'set', 'SOLO_PV=x', '--environment', 'preview'], t.ctx)).toBe(0);
    const puts = api.llamadas.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.body)).toEqual([
      { project: 'tienda', environment: 'production', name: 'NEXT_PUBLIC_GA_ID', value: 'G-123', secret: false },
      { project: 'tienda', environment: 'production', name: 'CMS_TOKEN', value: 's3cr3t-valor=con-igual', secret: true },
      { project: 'tienda', environment: 'preview', name: 'SOLO_PV', value: 'x', secret: false },
    ]);
    const salida = t.out.join('\n');
    expect(salida).toContain('✔ CMS_TOKEN creada (secreta) en producción de "tienda"');
    expect(salida).toContain('Se aplica en el próximo `hermes deploy`');
    expect(salida).toContain('Se aplica en el próximo `hermes deploy --preview`');

    t.out.length = 0;
    expect(await main(['env', 'list'], t.ctx)).toBe(0);
    const lista = t.out.join('\n');
    expect(lista).toContain('NEXT_PUBLIC_GA_ID');
    expect(lista).toContain('G-123');
    expect(lista).toMatch(/CMS_TOKEN\s+production\s+•••••• \(secreta\)/);
    expect(lista).not.toContain('s3cr3t');
    t.out.length = 0;
    expect(await main(['env', 'list', '--environment', 'preview', '--json'], t.ctx)).toBe(0);
    expect(JSON.parse(t.out.join('\n')).map((v: any) => v.name)).toEqual(['SOLO_PV']);
  });

  it('valida antes de ir a la API: formato, reservadas, NEXT_PUBLIC_* secreta, vacía, 5 KB, entorno', async () => {
    const { t, api } = await linkeado();
    const casos: Array<[string[], RegExp]> = [
      [['env', 'set', 'minuscula=1'], /mayúsculas/],
      [['env', 'set', 'SIN_IGUAL'], /Uso: hermes env set/],
      [['env', 'set', 'HERMES_TENANT=otra'], /reservada/],
      [['env', 'set', 'CLOUDFLARE_API_TOKEN=x'], /reservada/],
      [['env', 'set', 'CF_X=x'], /reservada/],
      [['env', 'set', 'ASSETS=x'], /reservada/],
      [['env', 'set', 'NEXT_PUBLIC_X=1', '--secret'], /no pueden ser secretas/],
      [['env', 'set', 'VACIA='], /vacío/],
      [['env', 'set', `GRANDE=${'x'.repeat(5 * 1024 + 1)}`], /5 KB/],
      [['env', 'set', 'A=1', '--environment', 'qa'], /production o preview/],
    ];
    for (const [argv, msg] of casos) {
      t.err.length = 0;
      expect(await main(argv, t.ctx)).toBe(1);
      expect(t.err.join('\n')).toMatch(msg);
    }
    expect(api.llamadas.filter((c) => c.path.startsWith(`${BASE}/env`))).toEqual([]);
  });

  it('rm: pide --yes sin terminal; con --yes borra la del entorno pedido; 404 si no existe', async () => {
    const { t, api } = await linkeado();
    await main(['env', 'set', 'A=1'], t.ctx);
    expect(await main(['env', 'rm', 'A'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/--yes/);
    expect(await main(['env', 'rm', 'A', '--yes'], t.ctx)).toBe(0);
    expect(api.llamadas.at(-1)!.path).toBe(`${BASE}/env/A?project=tienda&environment=production`);
    expect(t.out.join('\n')).toMatch(/A borrada de producción/);
    expect(await main(['env', 'rm', 'A', '--yes'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/Error \(404\): A no existe/);
  });

  it('API vieja (sin la ruta) → mensaje claro; plan sin hosting → el mensaje de la API', async () => {
    const vieja = await linkeado({ vieja: true });
    expect(await main(['env', 'list'], vieja.t.ctx)).toBe(1);
    expect(vieja.t.err.join('\n')).toMatch(/todavía no tiene `hermes env`/);
    const sinPlan = await linkeado({ sinPlan: true });
    expect(await main(['env', 'set', 'A=1'], sinPlan.t.ctx)).toBe(1);
    expect(sinPlan.t.err.join('\n')).toMatch(/Error \(403\): El plan de mimarca no incluye el hosting/);
  });

  it('env pull: baja las NO secretas al .env y nunca las secretas (no conoce su valor)', async () => {
    const { t, api } = await linkeado();
    await main(['env', 'set', 'NEXT_PUBLIC_GA_ID=G-123'], t.ctx);
    await main(['env', 'set', 'CMS_URL=https://cms.x.com/api?a=1'], t.ctx);
    await main(['env', 'set', 'CMS_TOKEN=muy-secreto', '--secret'], t.ctx);
    await main(['env', 'set', 'SOLO_PV=pv', '--environment', 'preview'], t.ctx);
    t.out.length = 0;
    expect(await main(['env', 'pull'], t.ctx)).toBe(0);
    const env = await readFile(join(t.cwd, '.env'), 'utf8');
    expect(env).toContain('NEXT_PUBLIC_GA_ID=G-123');
    expect(env).toContain('CMS_URL="https://cms.x.com/api?a=1"');
    expect(env).toContain('MIA=local'); // lo tuyo no se toca
    expect(env).not.toContain('CMS_TOKEN');
    expect(env).not.toContain('muy-secreto');
    expect(env).not.toContain('SOLO_PV');
    expect(t.out.join('\n')).toMatch(/Secretas que no se bajan.*CMS_TOKEN/);
    expect(api.llamadas.find((c) => c.method === 'GET' && c.path.startsWith(`${BASE}/env`))!.path).toBe(
      `${BASE}/env?project=tienda&environment=production`,
    );
    // --environment preview: las de las previews.
    expect(await main(['env', 'pull', '--environment', 'preview'], t.ctx)).toBe(0);
    expect(await readFile(join(t.cwd, '.env'), 'utf8')).toContain('SOLO_PV=pv');
  });

  it('env pull con una API vieja o sin hosting: sigue verificando los tokens como antes', async () => {
    for (const o of [{ vieja: true }, { sinPlan: true }]) {
      const { t } = await linkeado(o);
      expect(await main(['env', 'pull'], t.ctx)).toBe(0);
      expect(t.out.join('\n')).toContain('tokens vigentes');
    }
  });
});

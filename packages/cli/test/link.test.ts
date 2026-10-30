import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { SESION, apiFalsa, ctxDePrueba } from './helpers';
import type { ProyectoDeMarca, ProyectosDeMarca } from '../src/api';

interface T {
  id: number;
  name: string;
  token_prefix: string;
  kind: 'public' | 'private';
  revoked_at: string | null;
  token: string;
  /** Creado por otra cuenta (otra agencia / Pow / el hosting). */
  ajeno?: boolean;
  purpose?: 'runtime' | 'dev' | null;
}

/** La API de la CLI en memoria (lo mínimo de /api/cli/**). */
function apiDeMarcas(opts: { acotada?: boolean; proyectos?: ProyectosDeMarca } = {}) {
  const tokens: T[] = [];
  const nuevo = (name: string, kind: 'public' | 'private', ajeno = false, purpose: T['purpose'] = null) => {
    const id = tokens.length + 1;
    const token = `${kind === 'public' ? 'pst_' : 'psk_'}${String(id).repeat(40).slice(0, 40)}`;
    const t: T = { id, name, token_prefix: token.slice(0, 12), kind, revoked_at: null, token, ajeno, purpose };
    tokens.push(t);
    return t;
  };
  const api = apiFalsa((c) => {
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    if (c.path === '/api/cli/me')
      return {
        body: {
          user: { id: 7, email: SESION.email, name: 'Ana' },
          is_staff: false,
          token: {
            prefix: 'hct_aaaaaaaa',
            client_name: 'x',
            expires_at: SESION.expires_at,
            ...(opts.acotada ? { all_tenants: false, tenants: ['mimarca'] } : {}),
          },
          tenants: opts.acotada
            ? [{ tenant: 'mimarca', name: 'Mimarca', role: 'admin', can_link: true }]
            : [
                { tenant: 'mimarca', name: 'Mimarca', role: 'admin', can_link: true },
                { tenant: 'otramarca', name: 'Otramarca', role: 'admin', can_link: true },
                { tenant: 'tercera', name: 'Tercera', role: 'store', can_link: false },
              ],
        },
      };
    // Sin `proyectos`: una API vieja (404 en /projects).
    if (opts.proyectos && /^\/api\/cli\/tenants\/[^/]+\/projects$/.test(c.path)) return { body: opts.proyectos };
    const m = /^\/api\/cli\/tenants\/([^/]+)\/(link|tokens|dev-tokens\/revoke)(?:\/(\d+))?$/.exec(c.path);
    if (!m) return undefined;
    const [, tenant, que, id] = m;
    if (opts.acotada && tenant !== 'mimarca')
      return {
        status: 403,
        body: {
          error: 'cuenta_no_autorizada',
          message: `Esta sesión de la CLI no tiene acceso a ${tenant}. Corré \`hermes login\` y autorizá esa cuenta.`,
        },
      };
    if (tenant === 'tercera')
      return { status: 403, body: { error: 'Tu rol en esta marca no alcanza' } };
    if (que === 'tokens' && c.method === 'GET')
      return {
        body: {
          storefront_tokens: tokens.map(({ token: _t, ajeno, ...r }) => ({
            ...r,
            created_by: ajeno ? 'otra agencia/POW' : SESION.email,
            own: !ajeno,
            revocable: !ajeno && !r.revoked_at,
          })),
        },
      };
    if (que === 'tokens' && c.method === 'DELETE') {
      const t = tokens.find((x) => x.id === Number(id) && !x.revoked_at);
      if (!t) return { status: 404, body: { error: 'Token no encontrado o ya revocado' } };
      if (t.ajeno) return { status: 403, body: { error: 'Desde la CLI sólo podés revocar tokens que creaste vos con la CLI' } };
      t.revoked_at = 'ahora';
      return { body: { success: true } };
    }
    const p = c.body.project_name;
    const nombre = `${p} · dev · ${SESION.email}`;
    const misDev = () =>
      tokens.filter(
        (t) => !t.revoked_at && !t.ajeno && t.purpose === 'dev' && (t.name === nombre || t.name === `${nombre} (servidor)`),
      );
    if (que === 'dev-tokens/revoke') {
      const r = misDev();
      r.forEach((t) => (t.revoked_at = 'ahora'));
      return { body: { success: true, revoked_token_ids: r.map((t) => t.id) } };
    }
    // link: tokens dev personales; rota sólo los míos de este proyecto.
    const viejos = misDev();
    const pub = nuevo(nombre, 'public', false, 'dev');
    const priv = c.body.private === false ? null : nuevo(`${nombre} (servidor)`, 'private', false, 'dev');
    viejos.forEach((t) => (t.revoked_at = 'ahora'));
    const env: Record<string, string> = {
      HERMES_TENANT: tenant,
      HERMES_API_URL: 'https://api.pow.la/api',
      HERMES_PUBLIC_TOKEN: pub.token,
    };
    if (priv) env.HERMES_PRIVATE_TOKEN = priv.token;
    if (c.body.revalidate_url) env.HERMES_REVALIDATE_SECRET = 'whsec_1';
    return {
      status: 201,
      body: {
        tenant,
        api_url: 'https://api.pow.la/api',
        project_name: p,
        purpose: 'dev',
        localhost: true,
        rotated: viejos.length > 0,
        revoked_token_ids: viejos.map((t) => t.id),
        public_token: { id: pub.id, name: pub.name, token_prefix: pub.token_prefix, token: pub.token },
        private_token: priv
          ? { id: priv.id, name: priv.name, token_prefix: priv.token_prefix, scopes: ['checkout_sessions:read', 'webhooks:manage'], token: priv.token }
          : null,
        domains: c.body.domains ?? [],
        revalidate: c.body.revalidate_url ? { webhook_subscription_id: 1, url: c.body.revalidate_url, secret: 'whsec_1' } : null,
        warnings: [],
        env,
      },
    };
  });
  return { ...api, tokens, nuevo };
}

async function logueado(
  opts: { respuestas?: string[]; interactive?: boolean; acotada?: boolean; proyectos?: ProyectosDeMarca } = {},
) {
  const api = apiDeMarcas({ acotada: opts.acotada, proyectos: opts.proyectos });
  const t = await ctxDePrueba(api.fetch, opts);
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  const leer = (f: string) => readFile(join(t.cwd, f), 'utf8');
  return { api, t, leer };
}

describe('hermes link', () => {
  it('elige la marca de la lista, crea tokens y escribe .env sin pisar otras variables (proyecto = ID de la marca, sin preguntar)', async () => {
    const { api, t, leer } = await logueado({ interactive: true, respuestas: ['2'] });
    await writeFile(join(t.cwd, '.env'), 'DATABASE_URL=postgres://x\n');
    await writeFile(join(t.cwd, 'package.json'), JSON.stringify({ name: '@agencia/tienda-yag' }));

    expect(await main(['link', '--domain', 'tienda.agencia.com'], t.ctx)).toBe(0);

    // Sólo ofrece las marcas donde puede linkear (no tercera).
    expect(t.out.join('\n')).toContain('1) Mimarca (mimarca)');
    expect(t.out.join('\n')).not.toContain('Tercera');
    const linkCall = api.llamadas.find((c) => c.path.endsWith('/link'))!;
    expect(linkCall.path).toBe('/api/cli/tenants/otramarca/link');
    expect(linkCall.body).toEqual({ project_name: 'otramarca', domains: ['tienda.agencia.com'] });
    expect(t.out.join('\n')).not.toContain('Nombre del proyecto');

    const env = await leer('.env');
    expect(env).toMatch(/^DATABASE_URL=postgres:\/\/x\n/);
    expect(env).toContain('HERMES_TENANT=otramarca\n');
    expect(env).toContain('HERMES_API_URL=https://api.pow.la/api\n');
    expect(env).toMatch(/HERMES_PUBLIC_TOKEN=pst_/);
    expect(env).toMatch(/HERMES_PRIVATE_TOKEN=psk_/);
    expect(env).not.toContain('HERMES_REVALIDATE_SECRET');
    expect(await leer('.gitignore')).toBe('.env\n');
    const proyecto = JSON.parse(await leer('.hermes/project.json'));
    expect(proyecto).toMatchObject({ tenant: 'otramarca', project_name: 'otramarca' });
    // project.json es del equipo (git): sin tokens ni ids personales.
    expect(proyecto).not.toHaveProperty('public_token_id');
    expect(JSON.stringify(proyecto)).not.toMatch(/pst_|psk_/);
    expect(t.out.join('\n')).toContain('Son tus tokens de desarrollo (personales, con localhost)');
  });

  it('--tenant y --project sin preguntar (--name, el de antes, también); --no-private y --revalidate-url', async () => {
    const { api, t, leer } = await logueado();
    expect(
      await main(
        ['link', '--tenant', 'mimarca', '--project', 'demo', '--revalidate-url', 'https://x.com/api/hermes/revalidate'],
        t.ctx,
      ),
    ).toBe(0);
    expect(await leer('.env')).toContain('HERMES_REVALIDATE_SECRET=whsec_1');
    expect(linkDe(api)).toEqual(['demo']);
    const { t: t2 } = await logueado();
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'solo', '--no-private'], t2.ctx)).toBe(0);
    expect(await readFile(join(t2.cwd, '.env'), 'utf8')).not.toContain('HERMES_PRIVATE_TOKEN');
    expect(api.llamadas.some((c) => c.path === '/api/cli/me')).toBe(true);
  });

  it('marca sin rol suficiente o ajena: error claro, no llama a link', async () => {
    const { api, t } = await logueado();
    expect(await main(['link', '--tenant', 'tercera', '--name', 'x'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/rol en tercera/);
    expect(await main(['link', '--tenant', 'otra', '--name', 'x'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/No tenés acceso a la marca "otra"/);
    expect(api.llamadas.some((c) => c.path.endsWith('/link'))).toBe(false);
  });

  it('re-link del mismo proyecto: no pregunta nada y rota SÓLO tus tokens de desarrollo', async () => {
    const { api, t, leer } = await logueado();
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx)).toBe(0);
    const primero = await leer('.env');
    const pj = await leer('.hermes/project.json');
    // Sin terminal y sin --yes: igual anda (no hay nada que confirmar).
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx)).toBe(0);
    expect(await leer('.env')).not.toBe(primero);
    expect(t.out.join('\n')).toContain('Tokens de desarrollo rotados');
    expect(t.out.join('\n')).toContain('Tus tokens de desarrollo anteriores de este proyecto ya no valen');
    expect(api.tokens.filter((x) => !x.revoked_at).map((x) => x.id)).toEqual([3, 4]);
    // project.json (del equipo) no se reescribe si no cambió.
    expect(await leer('.hermes/project.json')).toBe(pj);
  });

  it('link en un proyecto que ya está deployado: no ofrece rotar ni toca los tokens de la tienda', async () => {
    const { api, t } = await logueado({ interactive: true });
    api.nuevo('Hermes: demo · production', 'public', true, 'runtime');
    api.nuevo('Hermes: demo · production (servidor)', 'private', true, 'runtime');
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx)).toBe(0);
    // Ninguna pregunta (sólo podría haber preguntado el nombre: vino por flag).
    expect(t.out.join('\n')).not.toMatch(/Rotar|\[s\/N\]/);
    expect(api.tokens.slice(0, 2).every((x) => !x.revoked_at)).toBe(true);
    expect(api.llamadas.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('un token de otra cuenta con el mismo nombre no dispara la rotación', async () => {
    const { api, t } = await logueado();
    api.nuevo('CLI: demo', 'public', true);
    // Sin --yes y sin terminal: si pidiera confirmar la rotación, fallaría.
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).not.toContain('Ya hay tokens vigentes');
    expect(api.tokens[0].revoked_at).toBeNull();
  });
});

const MI_TIENDA: ProyectoDeMarca = {
  name: 'mi-tienda',
  production_url: 'https://mi-tienda-abc--mimarca.hermescdn.app',
  last_deploy_at: '2026-10-20T10:00:00.000Z',
  has_hosting: true,
};
const OUTLET: ProyectoDeMarca = {
  name: 'outlet',
  production_url: null,
  last_deploy_at: '2026-10-01T10:00:00.000Z',
  has_hosting: true,
};
/** Un proyecto que sólo tiene tokens de desarrollo (se linkeó y nunca se deployó). */
const PRUEBA: ProyectoDeMarca = { name: 'prueba', production_url: null, last_deploy_at: null, has_hosting: false };
const lista = (projects: ProyectoDeMarca[], max_projects: number | null = 1): ProyectosDeMarca => ({
  projects,
  max_projects,
  hosting_enabled: max_projects !== null,
});
const linkDe = (api: { llamadas: Array<{ path: string; body: any }> }) =>
  api.llamadas.filter((c) => c.path.endsWith('/link')).map((c) => c.body.project_name);

describe('hermes link: el proyecto de la marca', () => {
  it('1 proyecto: lo usa sin preguntar el nombre y explica cómo se trabaja en equipo', async () => {
    const { api, t, leer } = await logueado({ interactive: true, proyectos: lista([MI_TIENDA, PRUEBA]) });
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    expect(linkDe(api)).toEqual(['mi-tienda']);
    expect(t.out.join('\n')).not.toContain('Nombre del proyecto');
    expect(t.out.join('\n')).toContain(
      'Linkeado al proyecto «mi-tienda» de mimarca (es el proyecto de la tienda; para trabajar en equipo, cada uno usa su branch con `hermes deploy --preview`)',
    );
    expect(t.out.join('\n')).toContain('tu branch → `hermes deploy --preview`');
    expect(t.out.join('\n')).toContain('producción → `main` desde CI con `hermes deploy-token`');
    expect(JSON.parse(await leer('.hermes/project.json'))).toMatchObject({ project_name: 'mi-tienda' });
    expect(api.llamadas.some((c) => c.path === '/api/cli/tenants/mimarca/projects')).toBe(true);
  });

  it('varios: lista con URL y último deploy; «Crear un proyecto nuevo» si el plan tiene lugar', async () => {
    const { api, t } = await logueado({ interactive: true, respuestas: ['2'], proyectos: lista([MI_TIENDA, OUTLET], 3) });
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    const out = t.out.join('\n');
    expect(out).toContain('1) mi-tienda (https://mi-tienda-abc--mimarca.hermescdn.app, último deploy 2026-10-20)');
    expect(out).toContain('2) outlet (sin producción activa, último deploy 2026-10-01)');
    expect(out).toContain('3) Crear un proyecto nuevo');
    expect(linkDe(api)).toEqual(['outlet']);

    // Crear uno nuevo: con el ID de la marca, sin preguntar.
    const { api: api2, t: t2 } = await logueado({
      interactive: true,
      respuestas: ['3'],
      proyectos: lista([MI_TIENDA, OUTLET], 3),
    });
    expect(await main(['link', '--tenant', 'mimarca'], t2.ctx)).toBe(0);
    expect(t2.out.join('\n')).not.toContain('Nombre del proyecto');
    expect(linkDe(api2)).toEqual(['mimarca']);

    // Si ya hay uno con el ID de la marca, ahí sí pregunta (con otro sugerido).
    const MIMARCA = { ...OUTLET, name: 'mimarca' };
    const { api: api3, t: t3 } = await logueado({
      interactive: true,
      respuestas: ['3', ''],
      proyectos: lista([MI_TIENDA, MIMARCA], 3),
    });
    expect(await main(['link', '--tenant', 'mimarca'], t3.ctx)).toBe(0);
    expect(t3.out.join('\n')).toContain('Nombre del proyecto nuevo [mimarca-2]');
    expect(linkDe(api3)).toEqual(['mimarca-2']);
  });

  it('varios con el plan lleno: sin «Crear un proyecto nuevo»; sin terminal pide --project', async () => {
    const { t } = await logueado({ interactive: true, respuestas: ['1'], proyectos: lista([MI_TIENDA, OUTLET], 2) });
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('2) outlet');
    expect(t.out.join('\n')).not.toContain('Crear un proyecto nuevo');

    const { api, t: t2 } = await logueado({ proyectos: lista([MI_TIENDA, OUTLET], 2) });
    expect(await main(['link', '--tenant', 'mimarca'], t2.ctx)).toBe(1);
    expect(t2.err.join('\n')).toContain('mimarca tiene varios proyectos (mi-tienda, outlet)');
    expect(linkDe(api)).toEqual([]);
  });

  it('ninguno: lo crea con el ID de la marca, sin preguntar (ni el package.json ni la carpeta)', async () => {
    const { api, t } = await logueado({ interactive: true, proyectos: lista([], 1) });
    await writeFile(join(t.cwd, 'package.json'), JSON.stringify({ name: '@agencia/tienda-yag' }));
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).not.toContain('Nombre del proyecto');
    expect(linkDe(api)).toEqual(['mimarca']);
    expect(t.out.join('\n')).not.toContain('es el proyecto de la tienda');
  });

  it('sin hosting: los proyectos que tienen tokens cuentan (1 → ése, sin preguntar)', async () => {
    const { api, t } = await logueado({ interactive: true, proyectos: lista([PRUEBA], null) });
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    expect(linkDe(api)).toEqual(['prueba']);
  });

  it('--project inexistente con el plan lleno: falla en el link (no en el deploy) y sugiere el que existe', async () => {
    const { api, t } = await logueado({ proyectos: lista([MI_TIENDA, PRUEBA], 1) });
    expect(await main(['link', '--tenant', 'mimarca', '--project', 'Prueba'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain(
      'El plan de mimarca permite 1 proyecto y ya existe «mi-tienda»: «prueba» no se podría deployar. Usá ese: `hermes link --project mi-tienda`.',
    );
    expect(linkDe(api)).toEqual([]);
    // El existente por --name anda (y un nombre equivalente también).
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'Mi Tienda'], t.ctx)).toBe(0);
    expect(linkDe(api)).toEqual(['Mi Tienda']);
    // Con lugar en el plan, --name crea otro.
    const { api: api2, t: t2 } = await logueado({ proyectos: lista([MI_TIENDA], 2) });
    expect(await main(['link', '--tenant', 'mimarca', '--name', 'outlet'], t2.ctx)).toBe(0);
    expect(linkDe(api2)).toEqual(['outlet']);
  });

  it('project.json apunta a un proyecto que la marca no tiene: avisa y ofrece cambiarlo', async () => {
    const { api, t, leer } = await logueado({ interactive: true, respuestas: ['s'], proyectos: lista([MI_TIENDA, PRUEBA], 1) });
    await mkdir(join(t.cwd, '.hermes'), { recursive: true });
    await writeFile(
      join(t.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'prueba', api: 'https://api.pow.la', linked_at: 'x' }),
    );
    expect(await main(['link'], t.ctx)).toBe(0);
    expect(t.err.join('\n')).toContain(
      '⚠ Esta carpeta está linkeada al proyecto «prueba», pero mimarca no lo tiene: el proyecto de la tienda es «mi-tienda». El plan permite 1 y ya están en uso',
    );
    expect(t.out.join('\n')).toContain('¿Cambiarlo a «mi-tienda»? [S/n]');
    expect(linkDe(api)).toEqual(['mi-tienda']);
    expect(JSON.parse(await leer('.hermes/project.json'))).toMatchObject({ project_name: 'mi-tienda' });

    // Si no lo cambia y el plan está lleno: error claro (el deploy fallaría).
    const { api: api2, t: t2 } = await logueado({ interactive: true, respuestas: ['n'], proyectos: lista([MI_TIENDA], 1) });
    await mkdir(join(t2.cwd, '.hermes'), { recursive: true });
    await writeFile(
      join(t2.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'prueba', api: 'https://api.pow.la', linked_at: 'x' }),
    );
    expect(await main(['link'], t2.ctx)).toBe(1);
    expect(t2.err.join('\n')).toContain('Usá ese: `hermes link --project mi-tienda`');
    expect(linkDe(api2)).toEqual([]);
  });

  it('project.json apunta al proyecto que existe: re-link sin preguntar', async () => {
    const { api, t } = await logueado({ interactive: true, proyectos: lista([MI_TIENDA], 1) });
    await mkdir(join(t.cwd, '.hermes'), { recursive: true });
    await writeFile(
      join(t.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'mi-tienda', api: 'https://api.pow.la', linked_at: 'x' }),
    );
    expect(await main(['link'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).not.toMatch(/Nombre del proyecto|\[S\/n\]|Elegí/);
    expect(t.err.join('\n')).not.toContain('⚠');
    expect(linkDe(api)).toEqual(['mi-tienda']);
  });

  it('API vieja (sin /projects → 404): el ID de la marca, sin preguntar', async () => {
    const { api, t } = await logueado({ interactive: true });
    expect(await main(['link', '--tenant', 'mimarca'], t.ctx)).toBe(0);
    expect(api.llamadas.some((c) => c.path.endsWith('/projects'))).toBe(true);
    expect(t.out.join('\n')).not.toContain('Nombre del proyecto');
    expect(linkDe(api)).toEqual(['mimarca']);
  });
});

describe('hermes unlink / env pull', () => {
  it('env pull: verifica que los tokens del .env sigan vigentes', async () => {
    const { t } = await logueado();
    await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx);
    expect(await main(['env', 'pull'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('tokens vigentes');

    // Alguien borró el token del .env: no se puede recuperar → --rotate.
    const env = await readFile(join(t.cwd, '.env'), 'utf8');
    await writeFile(join(t.cwd, '.env'), env.replace(/HERMES_PUBLIC_TOKEN=.*\n/, ''));
    expect(await main(['env', 'pull'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/--rotate/);
    expect(await main(['env', 'pull', '--rotate'], t.ctx)).toBe(0);
    expect(await readFile(join(t.cwd, '.env'), 'utf8')).toMatch(/HERMES_PUBLIC_TOKEN=pst_/);
  });

  it('env pull sin link previo', async () => {
    const { t } = await logueado();
    expect(await main(['env', 'pull'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/hermes link/);
  });

  it('unlink saca HERMES_* y el link; --revoke además revoca SÓLO tus tokens de desarrollo', async () => {
    const { api, t, leer } = await logueado();
    api.nuevo('Hermes: demo · production', 'public', true, 'runtime');
    await writeFile(join(t.cwd, '.env'), 'A=1\n');
    await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx);
    expect(await main(['unlink', '--revoke', '--yes'], t.ctx)).toBe(0);
    expect(await leer('.env')).toBe('A=1\n');
    await expect(leer('.hermes/project.json')).rejects.toThrow();
    const revoke = api.llamadas.find((c) => c.path.endsWith('/dev-tokens/revoke'))!;
    expect(revoke).toMatchObject({ method: 'POST', body: { project_name: 'demo' } });
    expect(api.llamadas.some((c) => c.method === 'DELETE')).toBe(false);
    expect(t.out.join('\n')).toContain('Revocados tus tokens de desarrollo: #2, #3');
    // El de la tienda sigue.
    expect(api.tokens[0].revoked_at).toBeNull();
    expect(api.tokens.slice(1).every((x) => x.revoked_at)).toBe(true);
  });
});

describe('ayuda', () => {
  it('sin comando muestra la ayuda; comando desconocido → 2', async () => {
    const t = await ctxDePrueba(apiFalsa(() => undefined).fetch);
    expect(await main([], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Uso: hermes <comando>');
    expect(await main(['publicar'], t.ctx)).toBe(2);
    expect(await main(['--version'], t.ctx)).toBe(0);
  });

  it('sesión acotada: una marca no autorizada da el error con la lista y `hermes login`, sin llamar a link', async () => {
    const { api, t } = await logueado({ acotada: true });
    expect(await main(['link', '--tenant', 'otramarca', '--name', 'x'], t.ctx)).toBe(1);
    const err = t.err.join('\n');
    expect(err).toMatch(/no tiene acceso a "otramarca"/);
    expect(err).toMatch(/hermes login/);
    expect(err).toMatch(/Cuentas de esta sesión: mimarca/);
    expect(api.llamadas.some((c) => c.path.endsWith('/link'))).toBe(false);
  });

  it('403 cuenta_no_autorizada de la API (proyecto linkeado a otra marca): mensaje + lista', async () => {
    const { t } = await logueado({ acotada: true });
    // El proyecto quedó linkeado a otramarca en una sesión anterior.
    await main(['link', '--tenant', 'mimarca', '--name', 'demo'], t.ctx);
    const pj = join(t.cwd, '.hermes', 'project.json');
    const p = JSON.parse(await readFile(pj, 'utf8'));
    await writeFile(pj, JSON.stringify({ ...p, tenant: 'otramarca' }));
    t.err.length = 0;
    expect(await main(['env', 'pull'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(
      /Esta sesión de la CLI no tiene acceso a otramarca\. Corré `hermes login` y autorizá esa cuenta\./,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { VERSION } from '../src/context';
import { detectarPm } from '../src/commands/dev';
import { SESION, apiFalsa, ctxDePrueba } from './helpers';

const PST = 'pst_' + '1'.repeat(40);
const PSK = 'psk_' + '2'.repeat(40);

/** API de la CLI con los dos tokens del proyecto (o revocados) + las categorías de la marca. */
function api(opts: { revocado?: boolean } = {}) {
  return apiFalsa((c) => {
    if (c.path === '/api/v2/categories/header')
      return { body: { categories: [{ id: 1, slug: 'remeras', name: 'Remeras' }] } };
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    if (c.path === '/api/cli/tenants/mimarca/tokens')
      return {
        body: {
          storefront_tokens: [
            { id: 1, name: 'CLI: tienda', token_prefix: PST.slice(0, 12), kind: 'public', revoked_at: opts.revocado ? 'ayer' : null, created_by: SESION.email, created_at: 'x' },
            { id: 2, name: 'CLI: tienda (servidor)', token_prefix: PSK.slice(0, 12), kind: 'private', revoked_at: null, created_by: SESION.email, created_at: 'x' },
          ],
        },
      };
    return undefined;
  });
}

/** Un storefront falso: package.json, .env con las HERMES_*, .hermes/project.json y node_modules. */
async function proyecto(
  opts: {
    linkeado?: boolean;
    scripts?: Record<string, string>;
    deps?: Record<string, string>;
    lock?: string;
    nodeModules?: boolean;
    env?: string;
    revocado?: boolean;
    interactive?: boolean;
    respuestas?: string[];
    codigos?: number[];
    logueado?: boolean;
  } = {},
) {
  const a = api({ revocado: opts.revocado });
  const t = await ctxDePrueba(a.fetch, { interactive: opts.interactive, respuestas: opts.respuestas, codigos: opts.codigos });
  if (opts.logueado !== false) await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  await writeFile(
    join(t.cwd, 'package.json'),
    JSON.stringify({
      name: 'tienda',
      scripts: opts.scripts ?? { dev: 'next dev', build: 'next build', start: 'next start' },
      ...(opts.deps ? { dependencies: opts.deps } : {}),
    }),
  );
  await writeFile(
    join(t.cwd, '.env'),
    opts.env ??
      `OTRA=1\nHERMES_TENANT=mimarca\nHERMES_API_URL=https://api.ejemplo.test/api\nHERMES_PUBLIC_TOKEN=${PST}\nHERMES_PRIVATE_TOKEN=${PSK}\n`,
  );
  if (opts.linkeado !== false) {
    await mkdir(join(t.cwd, '.hermes'));
    await writeFile(
      join(t.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', public_token_id: 1, private_token_id: 2, linked_at: 'x' }),
    );
  }
  if (opts.lock) await writeFile(join(t.cwd, opts.lock), '');
  if (opts.nodeModules !== false) await mkdir(join(t.cwd, 'node_modules'));
  return { ...t, api: a };
}

describe('hermes dev', () => {
  it('verifica, imprime el banner y corre el script dev con PORT y las HERMES_* del .env', async () => {
    const t = await proyecto();
    expect(await main(['dev', '--port', '4100'], t.ctx)).toBe(0);
    expect(t.procesos).toHaveLength(1);
    const [p] = t.procesos;
    expect([p.cmd, ...p.args]).toEqual(['npm', 'run', 'dev']);
    expect(p.cwd).toBe(t.cwd);
    expect(p.env.PORT).toBe('4100');
    expect(p.env.HERMES_TENANT).toBe('mimarca');
    expect(p.env.HERMES_PUBLIC_TOKEN).toBe(PST);
    expect(p.env.HERMES_PRIVATE_TOKEN).toBe(PSK);
    expect(p.env.OTRA).toBeUndefined(); // sólo las HERMES_* (el resto lo carga el framework)
    const texto = t.out.join('\n');
    expect(texto).toContain('http://localhost:4100');
    expect(texto).toContain('Marca:    mimarca');
    expect(texto).toContain('otra API (https://api.ejemplo.test/api)');
    expect(texto).toContain('http://localhost:4100/categoria/remeras');
    // el pedido de categorías va con User-Agent (el WAF de api.pow.la da 403 sin él)
    expect(t.api.llamadas.find((c) => c.path === '/api/v2/categories/header')!.userAgent).toBe(`hermes-cli/${VERSION}`);
    expect(texto).toContain('http://localhost:4100/carrito');
    // la verificación de tokens fue contra la API de la CLI
    expect(t.api.llamadas.some((c) => c.path === '/api/cli/tenants/mimarca/tokens')).toBe(true);
  });

  it('usa el gestor del lockfile', async () => {
    const t = await proyecto({ lock: 'pnpm-lock.yaml' });
    await main(['dev'], t.ctx);
    expect(t.procesos[0].cmd).toBe('pnpm');
    expect(t.procesos[0].env.PORT).toBe('3000');
    expect(await detectarPm(t.cwd)).toBe('pnpm');
  });

  it('sin linkear: explica que hay que correr hermes link', async () => {
    const t = await proyecto({ linkeado: false });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/no está linkeada.*hermes link/);
    expect(t.procesos).toEqual([]);
  });

  it('token revocado: no levanta y sugiere env pull --rotate o hermes link', async () => {
    const t = await proyecto({ revocado: true });
    expect(await main(['dev'], t.ctx)).toBe(1);
    const err = t.err.join('\n');
    expect(err).toContain('HERMES_PUBLIC_TOKEN: el token público (pst_11111111…) está revocado');
    expect(err).toContain('hermes env pull --rotate');
    expect(err).toContain('hermes link');
    expect(t.procesos).toEqual([]);
  });

  it('el .env tiene otro token: tampoco levanta', async () => {
    const t = await proyecto({ env: `HERMES_TENANT=mimarca\nHERMES_PUBLIC_TOKEN=pst_${'9'.repeat(40)}\nHERMES_PRIVATE_TOKEN=${PSK}\n` });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('HERMES_PUBLIC_TOKEN no es un token público de mimarca');
  });

  it('sin login: pide hermes login (salvo --no-check)', async () => {
    const t = await proyecto({ logueado: false });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('hermes login');
    expect(await main(['dev', '--no-check'], t.ctx)).toBe(0);
    expect(t.procesos).toHaveLength(1);
  });

  it('sin script dev: error claro', async () => {
    const t = await proyecto({ scripts: { build: 'next build' } });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('no tiene el script "dev:next" ni "dev"');
  });

  it('faltan node_modules: ofrece instalar y después levanta', async () => {
    const t = await proyecto({ nodeModules: false, interactive: true, respuestas: [''], lock: 'yarn.lock' });
    expect(await main(['dev'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['yarn install', 'yarn run dev']);
  });

  it('faltan node_modules y dice que no: no corre nada', async () => {
    const t = await proyecto({ nodeModules: false, interactive: true, respuestas: ['n'] });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.procesos).toEqual([]);
    expect(t.err.join('\n')).toContain('npm install');
  });

  it('faltan node_modules sin terminal: pide --yes', async () => {
    const t = await proyecto({ nodeModules: false });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('--yes');
    const u = await proyecto({ nodeModules: false });
    expect(await main(['dev', '--yes'], u.ctx)).toBe(0);
    expect(u.procesos.map((p) => p.args.join(' '))).toEqual(['install', 'run dev']);
  });

  it('Ctrl+C (130) no es error; otro código sí', async () => {
    const a = await proyecto({ codigos: [130] });
    expect(await main(['dev'], a.ctx)).toBe(0);
    const b = await proyecto({ codigos: [1] });
    expect(await main(['dev'], b.ctx)).toBe(1);
    expect(b.err.join('\n')).toContain('`npm run dev` salió con 1');
  });

  it('--open abre el navegador cuando el server contesta', async () => {
    const t = await proyecto();
    // El "server" contesta: el fetch falso responde a cualquier URL (404 = está vivo).
    expect(await main(['dev', '--open', '--port', '3333'], t.ctx)).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(t.abiertos).toEqual(['http://localhost:3333']);
  });

  it('--port inválido', async () => {
    const t = await proyecto();
    expect(await main(['dev', '--port', 'abc'], t.ctx)).toBe(1);
  });
});

/** Los scripts del starter: la CLI como "dev"/"preview"/"deploy" y Next con otro nombre. */
const STARTER = {
  dev: 'hermes dev',
  'dev:next': 'next dev',
  build: 'next build',
  start: 'next start',
  preview: 'hermes preview',
  deploy: 'hermes deploy',
};

describe('hermes dev — sin bucles con los scripts del proyecto', () => {
  it('starter ("dev": "hermes dev"): corre "dev:next", no "dev"', async () => {
    const t = await proyecto({ scripts: STARTER, deps: { next: '16.4.3' } });
    expect(await main(['dev'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npm run dev:next']);
    expect(t.procesos[0].env.HERMES_CLI_CADENA).toBe('dev');
  });

  it('proyecto viejo (sólo "dev": "next dev"): sigue corriendo "dev"', async () => {
    const t = await proyecto({ scripts: { dev: 'next dev' } });
    expect(await main(['dev'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npm run dev']);
  });

  it('"dev": "hermes dev" sin "dev:next" en Next.js: corre next dev directo (con el gestor del lockfile)', async () => {
    const t = await proyecto({ scripts: { dev: 'hermes dev --open' }, deps: { next: '16.4.3' }, lock: 'pnpm-lock.yaml' });
    expect(await main(['dev'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['pnpm exec next dev']);
  });

  it('"dev": "npx hermes dev" sin "dev:next" y sin Next: error claro, no corre nada', async () => {
    const t = await proyecto({ scripts: { dev: 'npx hermes dev' } });
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/llama a la CLI de Hermes.*bucle.*"dev:next": "next dev"/);
    expect(t.procesos).toEqual([]);
  });

  it('"dev:next" que también llama a la CLI: tampoco lo corre', async () => {
    const t = await proyecto({ scripts: { dev: 'hermes dev', 'dev:next': 'hermes dev' }, deps: { next: '16.4.3' } });
    expect(await main(['dev'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npx --no next dev']);
  });

  it('si ya hay un hermes dev más arriba en la cadena (script indirecto), corta', async () => {
    const t = await proyecto({ scripts: { dev: 'node arranca.js' } });
    t.ctx.env = { HERMES_CLI_CADENA: 'dev' };
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('se está llamando a sí mismo');
    expect(t.procesos).toEqual([]);
  });
});

describe('hermes preview', () => {
  it('starter: "build" y "start" (los de Next), no el script "preview"', async () => {
    const t = await proyecto({ scripts: STARTER, deps: { next: '16.4.3' } });
    expect(await main(['preview'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npm run build', 'npm run start']);
    expect(t.procesos[0].env.HERMES_CLI_CADENA).toBe('preview');
  });

  it('"build": "hermes preview" en Next.js: next build directo', async () => {
    const t = await proyecto({ scripts: { build: 'hermes preview', start: 'next start' }, deps: { next: '16.4.3' } });
    expect(await main(['preview'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npx --no next build', 'npm run start']);
  });

  it('build y start con las mismas verificaciones', async () => {
    const t = await proyecto();
    expect(await main(['preview', '--port', '5000'], t.ctx)).toBe(0);
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual(['npm run build', 'npm run start']);
    expect(t.procesos[0].env.HERMES_TENANT).toBe('mimarca');
    expect(t.procesos[0].env.PORT).toBeUndefined();
    expect(t.procesos[1].env.PORT).toBe('5000');
    expect(t.procesos[1].env.NODE_ENV).toBe('production');
  });

  it('si el build falla no hace start', async () => {
    const t = await proyecto({ codigos: [1] });
    expect(await main(['preview'], t.ctx)).toBe(1);
    expect(t.procesos).toHaveLength(1);
    expect(t.err.join('\n')).toContain('El build falló');
  });

  it('sin scripts build/start: error claro', async () => {
    const t = await proyecto({ scripts: { dev: 'next dev' } });
    expect(await main(['preview'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('no tiene el script "build" ni el script "start"');
  });

  it('token revocado: no buildea', async () => {
    const t = await proyecto({ revocado: true });
    expect(await main(['preview'], t.ctx)).toBe(1);
    expect(t.procesos).toEqual([]);
  });
});

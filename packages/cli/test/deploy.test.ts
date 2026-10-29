import { describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { hashDeAsset, parseJsonc } from '../src/bundle';
import { Llamada, SESION, apiFalsa, ctxDePrueba } from './helpers';

const PST = 'pst_' + '1'.repeat(40);
const PSK = 'psk_' + '2'.repeat(40);
/** El pst_ de la TIENDA (runtime) que da la API para el build. */
const PST_TIENDA = 'pst_' + '7'.repeat(40);
const HDT = 'hdt_' + 'c'.repeat(48);

const ASSETS: Record<string, string> = {
  '_next/static/app.js': "console.log('hola')",
  '_next/static/app.css': 'body{}',
  'favicon.svg': '<svg/>',
  '.assetsignore': '_worker.js', // oculto: no se sube
};

const DEPLOY = {
  id: 5,
  project: 'tienda',
  environment: 'production',
  branch: null,
  script: 'mimarca-tienda-prod',
  url: 'https://tienda--mimarca.hermescdn.app',
  status: 'uploading',
  version_id: null,
  error: null,
  rollback_of: null,
  created_by: SESION.email,
  created_at: '2026-10-27T10:00:00Z',
  activated_at: null,
};

/** La API de Hermes con los endpoints del hosting. Cloudflare "ya tiene" app.css. */
function apiDeHosting(opts: { sinPlan?: boolean; dominios?: any[][]; activo?: Record<string, unknown> } = {}) {
  const pasadas = [...(opts.dominios ?? [])];
  return apiFalsa((c: Llamada) => {
    if (c.auth !== `Bearer ${SESION.token}` && c.auth !== `Bearer ${HDT}`) return { status: 401, body: { error: 'x' } };
    const base = '/api/cli/tenants/mimarca';
    if (c.method === 'POST' && c.path === `${base}/build-env`) {
      if (opts.sinPlan)
        return {
          status: 403,
          body: { error: 'hosting_no_habilitado', message: 'El plan de mimarca no incluye el hosting de Hermes (hermes deploy / hermes domains). Pedíselo a Pow.' },
        };
      return {
        body: { env: { HERMES_TENANT: 'mimarca', HERMES_API_URL: 'https://api.pow.la/api', HERMES_PUBLIC_TOKEN: PST_TIENDA } },
      };
    }
    if (c.path === `${base}/tokens`)
      return {
        body: {
          storefront_tokens: [
            { id: 1, name: 'CLI: tienda', token_prefix: PST.slice(0, 12), kind: 'public', revoked_at: null, created_by: SESION.email, created_at: 'x' },
            { id: 2, name: 'CLI: tienda (servidor)', token_prefix: PSK.slice(0, 12), kind: 'private', revoked_at: null, created_by: SESION.email, created_at: 'x' },
          ],
        },
      };
    if (c.method === 'POST' && c.path === `${base}/deployments`) {
      if (opts.sinPlan)
        return {
          status: 403,
          body: { error: 'hosting_no_habilitado', message: 'El plan de mimarca no incluye el hosting de Hermes (hermes deploy / hermes domains). Pedíselo a Pow.' },
        };
      const hashes = Object.entries(c.body.assets.manifest as Record<string, { hash: string }>)
        .filter(([ruta]) => ruta !== '/_next/static/app.css')
        .map(([, a]) => a.hash);
      return { status: 201, body: { deployment: DEPLOY, upload: { buckets: hashes.map((h) => [h]) } } };
    }
    if (c.method === 'POST' && c.path === `${base}/deployments/5/assets`) return { body: { received: 1, complete: false } };
    if (c.method === 'POST' && c.path === `${base}/deployments/5/finalize`)
      return { body: { deployment: { ...DEPLOY, status: 'active' }, url: DEPLOY.url, warnings: [] } };
    if (c.method === 'GET' && c.path.startsWith(`${base}/deployments`))
      return {
        body: {
          deployments: [
            { ...DEPLOY, id: 6, status: 'active', activated_at: '2026-10-27T11:00:00Z', ...(opts.activo ?? {}) },
            { ...DEPLOY, status: 'superseded', activated_at: '2026-10-27T10:00:00Z' },
          ],
        },
      };
    if (c.method === 'POST' && c.path === `${base}/deployments/5/rollback`)
      return { body: { deployment: { ...DEPLOY, id: 7, status: 'active', rollback_of: 5 }, url: DEPLOY.url, warnings: [] } };
    if (c.method === 'DELETE' && c.path.startsWith(`${base}/previews?`))
      return { body: { success: true, removed: { script: 's', url: 'https://feat-home--tienda-x--mimarca.hermescdn.app' }, warnings: [] } };
    if (c.method === 'POST' && c.path === `${base}/domains`)
      return {
        status: 201,
        body: {
          domains: [
            {
              hostname: 'www.mitienda.com', role: 'storefront', project: 'tienda', source: 'cli', status: 'pending',
              cf_status: 'pending', ssl_status: 'pending_validation', routed: false,
              status_message: 'Esperando que cargues el CNAME',
              dns_records: [
                { type: 'CNAME', name: 'www.mitienda.com', value: 'fallback.hermescdn.app', purpose: 'hostname', status: 'pending' },
              ],
              optional_records: [
                {
                  type: 'TXT', name: '_cf-custom-hostname.www.mitienda.com', value: 'own-123', purpose: 'hostname_ownership', status: 'pending',
                  description: 'Solo si tu dominio hoy apunta a otro sitio y querés pasarlo con el menor corte posible: cargá este TXT antes de cambiar el CNAME.',
                },
              ],
              apex_records: [
                { type: 'A', name: 'mitienda.com', value: '137.66.54.234' },
                { type: 'AAAA', name: 'mitienda.com', value: '2a09:8280:1::159:df04:0' },
              ],
            },
          ],
          warnings: [],
        },
      };
    if (c.method === 'GET' && c.path === `${base}/domains`)
      return { body: { domains: pasadas.shift() ?? [], warnings: [] } };
    if (c.method === 'DELETE' && c.path === `${base}/domains/www.mitienda.com`)
      return { body: { success: true, removed: ['www.mitienda.com', 'checkout.mitienda.com'] } };
    return undefined;
  });
}

/** Un storefront Next linkeado; el "build" (spawn) deja .open-next y .hermes/build. */
async function proyecto(
  opts: {
    herramientas?: boolean;
    config?: boolean;
    sinPlan?: boolean;
    interactive?: boolean;
    respuestas?: string[];
    dominios?: any[][];
    git?: string;
    activo?: Record<string, unknown>;
  } = {},
) {
  const a = apiDeHosting({ sinPlan: opts.sinPlan, dominios: opts.dominios, activo: opts.activo });
  const t = await ctxDePrueba(a.fetch, { interactive: opts.interactive, respuestas: opts.respuestas });
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  const w = (rel: string, txt: string) => mkdir(dirname(join(t.cwd, rel)), { recursive: true }).then(() => writeFile(join(t.cwd, rel), txt));
  await w('package.json', JSON.stringify({ name: 'tienda', dependencies: { next: '16.4.3' } }));
  await w('.env', `HERMES_TENANT=mimarca\nHERMES_API_URL=https://api.pow.la/api\nHERMES_PUBLIC_TOKEN=${PST}\nHERMES_PRIVATE_TOKEN=${PSK}\n`);
  await w('.hermes/project.json', JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', public_token_id: 1, private_token_id: 2, linked_at: 'x' }));
  if (opts.git) await w('.git/HEAD', `ref: refs/heads/${opts.git}\n`);
  if (opts.config !== false) {
    await w('open-next.config.ts', 'export default {};\n');
    await w('wrangler.jsonc', '// hola\n{ "name": "x", "main": ".open-next/worker.js", "compatibility_date": "2025-09-01",\n "compatibility_flags": ["nodejs_compat"], /* assets */ "assets": { "directory": ".open-next/assets", "binding": "ASSETS" }, }\n');
  }
  if (opts.herramientas !== false) {
    await mkdir(join(t.cwd, 'node_modules', '@opennextjs', 'cloudflare'), { recursive: true });
    await mkdir(join(t.cwd, 'node_modules', 'wrangler'), { recursive: true });
  }
  t.ctx.env = { CLOUDFLARE_API_TOKEN: 'no-debe-pasar', PATH: '/bin' };
  const durante: { envExiste: boolean }[] = [];
  let fallarBuild = false;
  let filtrar = '';
  t.ctx.spawn = async (cmd, args, o) => {
    t.procesos.push({ cmd, args, cwd: o.cwd, env: o.env });
    durante.push({ envExiste: await stat(join(t.cwd, '.env')).then(() => true, () => false) });
    if (fallarBuild && args.includes('opennextjs-cloudflare')) return 1;
    if (args.includes('opennextjs-cloudflare'))
      for (const [rel, txt] of Object.entries(ASSETS)) await w(`.open-next/assets/${rel}`, txt);
    if (args.includes('--dry-run')) {
      await w('.hermes/build/worker/worker.js', `export default {}${filtrar}`);
      await w('.hermes/build/worker/chunks/a.js', 'export const a = 1');
      await w('.hermes/build/worker/worker.js.map', '{}');
      await w('.hermes/build/worker/README.md', 'x');
    }
    return 0;
  };
  return {
    ...t,
    api: a,
    durante,
    fallar: () => (fallarBuild = true),
    filtrarEnElWorker: (v: string) => (filtrar = `;const x="${v}"`),
  };
}

describe('hermes deploy', () => {
  it('build (OpenNext + wrangler --dry-run sin token de CF), sube manifest, assets por bucket y módulos', async () => {
    const t = await proyecto();
    expect(await main(['deploy'], t.ctx)).toBe(0);
    // Build: opennext y el empaquetado, sin ninguna variable de Cloudflare.
    expect(t.procesos.map((p) => [p.cmd, ...p.args].join(' '))).toEqual([
      'npx --no opennextjs-cloudflare build',
      'npx --no wrangler deploy --dry-run --outdir .hermes/build/worker',
    ]);
    for (const p of t.procesos) {
      expect(p.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
      // El build usa el pst_ de la tienda (runtime), no el personal del .env.
      expect(p.env.HERMES_PUBLIC_TOKEN).toBe(PST_TIENDA);
    }
    expect(t.api.llamadas.find((c) => c.path.endsWith('/build-env'))!.body).toEqual({
      project: 'tienda',
      environment: 'production',
    });
    const crear = t.api.llamadas.find((c) => c.method === 'POST' && c.path.endsWith('/deployments'))!;
    expect(crear.body).toMatchObject({
      project: 'tienda',
      environment: 'production',
      worker: { main_module: 'worker.js', compatibility_date: '2025-09-01', compatibility_flags: ['nodejs_compat'] },
    });
    expect(crear.body.worker.modules.map((m: any) => [m.name, m.type])).toEqual([
      ['chunks/a.js', 'esm'],
      ['worker.js', 'esm'],
    ]);
    expect(Object.keys(crear.body.assets.manifest).sort()).toEqual([
      '/_next/static/app.css',
      '/_next/static/app.js',
      '/favicon.svg',
    ]);
    expect(crear.body.assets.manifest['/favicon.svg'].hash).toBe(hashDeAsset(Buffer.from('<svg/>'), '/favicon.svg'));
    // Sólo los assets que pidió la API (app.css ya estaba): un pedido por bucket.
    const subidas = t.api.llamadas.filter((c) => c.path.endsWith('/assets'));
    expect(subidas).toHaveLength(2);
    expect(subidas.every((c) => c.body instanceof FormData)).toBe(true);
    // Finalize: sólo los módulos. Los tokens de la tienda los pone Hermes:
    // los del .env (personales) no viajan.
    const fin = t.api.llamadas.find((c) => c.path.endsWith('/finalize'))!;
    const form = fin.body as FormData;
    expect([...form.keys()].sort()).toEqual(['chunks/a.js', 'worker.js']);
    expect(JSON.stringify(t.api.llamadas.map((c) => (c.body instanceof FormData ? null : c.body)))).not.toMatch(/pst_1|psk_/);
    expect(await (form.get('worker.js') as Blob).text()).toBe('export default {}');
    const texto = t.out.join('\n');
    expect(texto).toContain('Deploy #5 en el aire');
    expect(texto).toContain('https://tienda--mimarca.hermescdn.app');
    // Nunca habló con Cloudflare.
    expect(t.api.llamadas.every((c) => c.path.startsWith('/api/cli/'))).toBe(true);
  });

  it('--preview usa la branch de git; --branch la pisa', async () => {
    const t = await proyecto({ git: 'feat/home' });
    await main(['deploy', '--preview'], t.ctx);
    expect(t.api.llamadas.find((c) => c.path.endsWith('/deployments'))!.body).toMatchObject({ environment: 'preview', branch: 'feat/home' });
    const u = await proyecto();
    expect(await main(['deploy', '--preview'], u.ctx)).toBe(1);
    expect(u.err.join('\n')).toMatch(/--branch/);
    await main(['deploy', '--preview', '--branch', 'x'], u.ctx);
    expect(u.api.llamadas.find((c) => c.path.endsWith('/deployments'))!.body.branch).toBe('x');
  });

  it('sin config ni herramientas: crea open-next.config.ts + wrangler.jsonc e instala con --yes', async () => {
    const t = await proyecto({ config: false, herramientas: false });
    expect(await main(['deploy', '--yes'], t.ctx)).toBe(0);
    expect(t.procesos[0]).toMatchObject({ cmd: 'npm', args: ['install', '-D', '@opennextjs/cloudflare@^1', 'wrangler@^4'] });
    const w = parseJsonc(await readFile(join(t.cwd, 'wrangler.jsonc'), 'utf8')) as any;
    expect(w).toMatchObject({ main: '.open-next/worker.js', assets: { directory: '.open-next/assets' } });
    expect(w.compatibility_flags).toContain('nodejs_compat');
    await stat(join(t.cwd, 'open-next.config.ts'));
  });

  it('sin herramientas y sin terminal ni --yes: no instala nada', async () => {
    const t = await proyecto({ herramientas: false });
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/npm install -D @opennextjs\/cloudflare/);
    expect(t.procesos).toEqual([]);
  });

  it('plan sin hosting: muestra el mensaje de la API', async () => {
    const t = await proyecto({ sinPlan: true });
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/Error \(403\): El plan de mimarca no incluye el hosting/);
  });

  it('"build" que llama a la CLI → error (OpenNext lo correría en bucle), sin buildear', async () => {
    const t = await proyecto();
    await writeFile(
      join(t.cwd, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'hermes deploy' }, dependencies: { next: '16.4.3' } }),
    );
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/El script "build".*bucle.*"build": "next build"/);
    expect(t.procesos).toEqual([]);
  });

  it('el build lleva la cadena (un hermes deploy anidado corta)', async () => {
    const t = await proyecto();
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(t.procesos.find((p) => p.args.includes('opennextjs-cloudflare'))?.env.HERMES_CLI_CADENA).toBe('deploy');
    const t2 = await proyecto();
    t2.ctx.env = { HERMES_CLI_CADENA: 'deploy' };
    expect(await main(['deploy'], t2.ctx)).toBe(1);
    expect(t2.err.join('\n')).toContain('se está llamando a sí mismo');
  });

  it('starter (scripts "deploy": "hermes deploy", "build": "next build"): deploya', async () => {
    const t = await proyecto();
    await writeFile(
      join(t.cwd, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'next build', deploy: 'hermes deploy', dev: 'hermes dev' }, dependencies: { next: '16.4.3' } }),
    );
    expect(await main(['deploy'], t.ctx)).toBe(0);
  });

  it('no es Next.js → error claro', async () => {
    const t = await proyecto();
    await writeFile(join(t.cwd, 'package.json'), JSON.stringify({ name: 'x', dependencies: { astro: '5' } }));
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/por ahora despliega proyectos Next\.js/);
  });
});

describe('hermes deploy — secretos fuera del build (auditoría #5)', () => {
  it('el build corre SIN los .env* (los aparta y los devuelve) y sin las HERMES_* secretas', async () => {
    const t = await proyecto();
    await writeFile(join(t.cwd, '.env.local'), 'NEXT_PUBLIC_X=1\n');
    await writeFile(join(t.cwd, '.env.example'), 'HERMES_TENANT=\n');
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(t.durante.every((d) => !d.envExiste)).toBe(true);
    for (const p of t.procesos) {
      expect(p.env.HERMES_PRIVATE_TOKEN).toBeUndefined();
      expect(p.env.HERMES_REVALIDATE_SECRET).toBeUndefined();
      expect(p.env.HERMES_PUBLIC_TOKEN).toBe(PST_TIENDA);
    }
    expect(await readFile(join(t.cwd, '.env'), 'utf8')).toContain(PSK);
    expect(await readFile(join(t.cwd, '.env.local'), 'utf8')).toBe('NEXT_PUBLIC_X=1\n');
    await stat(join(t.cwd, '.env.example'));
    // El psk_ del .env (personal) no viaja: la tienda lleva el de runtime.
    const fin = t.api.llamadas.find((c) => c.path.endsWith('/finalize'))!;
    expect((fin.body as FormData).get('secrets')).toBeNull();
  });

  it('si el build falla, el .env vuelve igual', async () => {
    const t = await proyecto();
    t.fallar();
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(await readFile(join(t.cwd, '.env'), 'utf8')).toContain(PSK);
  });

  it('un build anterior cortado: devuelve el .env apartado sin pisar uno nuevo', async () => {
    const t = await proyecto();
    await mkdir(join(t.cwd, '.hermes/build/env-apartado'), { recursive: true });
    await writeFile(join(t.cwd, '.hermes/build/env-apartado/.env.production'), 'VIEJO=1\n');
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(await readFile(join(t.cwd, '.env.production'), 'utf8')).toBe('VIEJO=1\n');
  });

  it('si el worker empaquetado contiene el psk_, aborta sin subir nada', async () => {
    const t = await proyecto();
    t.filtrarEnElWorker(PSK);
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/tiene tus secretos .*worker\.js/);
    expect(t.api.llamadas.some((c) => c.path.endsWith('/deployments') && c.method === 'POST')).toBe(false);
  });

  it('si un asset estático (código del cliente) contiene el psk_, aborta sin subir nada', async () => {
    const t = await proyecto();
    const spawnOriginal = t.ctx.spawn;
    t.ctx.spawn = async (cmd, args, o) => {
      const code = await spawnOriginal(cmd, args, o);
      if (args.includes('opennextjs-cloudflare')) {
        await mkdir(join(t.cwd, '.open-next/assets/_next/static/chunks'), { recursive: true });
        await writeFile(join(t.cwd, '.open-next/assets/_next/static/chunks/page.js'), `const k="${PSK}"`);
      }
      return code;
    };
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/tiene tus secretos .*_next\/static\/chunks\/page\.js/);
    expect(t.api.llamadas.some((c) => c.path.endsWith('/deployments') && c.method === 'POST')).toBe(false);
  });
});

describe('hermes deployments / rollback', () => {
  it('deployments rm borra la preview de la branch de git (con --yes)', async () => {
    const t = await proyecto({ git: 'feat/home' });
    expect(await main(['deployments', 'rm'], t.ctx)).toBe(1);
    expect(await main(['deployments', 'rm', '--yes'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/api/cli/tenants/mimarca/previews?project=tienda&branch=feat%2Fhome',
    });
    expect(t.out.join('\n')).toContain('Preview de "feat/home" borrada');
  });

  it('lista los deploys del proyecto', async () => {
    const t = await proyecto();
    expect(await main(['deployments'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.path).toBe('/api/cli/tenants/mimarca/deployments?project=tienda');
    const texto = t.out.join('\n');
    expect(texto).toMatch(/● #6\s+active/);
    expect(texto).toMatch(/○ #5\s+superseded/);
  });

  it('rollback pide --yes sin terminal y llama a la API', async () => {
    const t = await proyecto();
    expect(await main(['rollback', '5'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/--yes/);
    expect(await main(['rollback', '5', '--yes'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('deploy #7 (versión de #5)');
    expect(await main(['rollback', 'abc', '--yes'], t.ctx)).toBe(1);
  });
});

describe('hermes domains', () => {
  const activo = {
    hostname: 'www.mitienda.com', role: 'storefront', project: 'tienda', source: 'cli', status: 'active',
    cf_status: 'active', ssl_status: 'active', routed: true, dns_records: [],
  };

  it('add muestra el CNAME como único obligatorio y la pre-validación como opcional', async () => {
    const t = await proyecto();
    expect(await main(['domains', 'add', 'www.mitienda.com'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.body).toEqual({ hostname: 'www.mitienda.com', project: 'tienda' });
    const texto = t.out.join('\n');
    expect(texto).toContain('Esperando que cargues el CNAME');
    const obligatorio = texto.slice(texto.indexOf('Cargá en el DNS'), texto.indexOf('Opcional —'));
    expect(obligatorio).toMatch(/CNAME\s+www\.mitienda\.com\s+→\s+fallback\.hermescdn\.app/);
    expect(obligatorio).not.toContain('TXT');
    expect(texto).not.toContain('_acme-challenge');
    // El TXT de propiedad, aparte y opcional, con su explicación.
    expect(texto).toContain('Opcional — Solo si tu dominio hoy apunta a otro sitio');
    expect(texto).toMatch(/TXT\s+_cf-custom-hostname\.www\.mitienda\.com\s+→\s+own-123/);
    // Opcional: el apex al redirector, con las IPs que manda la API.
    expect(texto).toContain('Opcional, para que mitienda.com sin www redirija a www.mitienda.com:');
    expect(texto).toMatch(/A\s+mitienda\.com\s+→\s+137\.66\.54\.234/);
    expect(texto).toMatch(/AAAA\s+mitienda\.com\s+→\s+2a09:8280:1::159:df04:0/);
  });

  it('list muestra el apex opcional sólo si la API manda apex_records', async () => {
    const conApex = {
      ...activo,
      apex_records: [{ type: 'A', name: 'mitienda.com', value: '203.0.113.7' }],
    };
    const sub = { ...activo, hostname: 'tienda.agencia.com', apex_records: null };
    const t = await proyecto({ dominios: [[conApex, sub]] });
    expect(await main(['domains', 'list'], t.ctx)).toBe(0);
    const texto = t.out.join('\n');
    expect(texto).toContain('para que mitienda.com sin www redirija a www.mitienda.com');
    expect(texto).toMatch(/A\s+mitienda\.com\s+→\s+203\.0\.113\.7/);
    expect(texto).not.toContain('tienda.agencia.com sin www');

    // Una API vieja (sin el campo): nada del apex.
    const t2 = await proyecto({ dominios: [[activo]] });
    expect(await main(['domains', 'list'], t2.ctx)).toBe(0);
    expect(t2.out.join('\n')).not.toContain('sin www');
  });

  it('add --checkout-subdomain pide checkout.<dominio> (opt-in); --no-checkout viejo = default', async () => {
    const t = await proyecto();
    expect(await main(['domains', 'add', 'mitienda.com', '--checkout-subdomain'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.body).toEqual({ hostname: 'mitienda.com', project: 'tienda', checkout: true });
    expect(await main(['domains', 'add', 'mitienda.com', '--no-checkout'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.body).toEqual({ hostname: 'mitienda.com', project: 'tienda' });
  });

  it('add --wait pollea hasta que quede activo y ruteado', async () => {
    const pendiente = { ...activo, status: 'pending', routed: false };
    const t = await proyecto({ dominios: [[pendiente], [{ ...activo, routed: false }], [activo]] });
    expect(await main(['domains', 'add', 'mitienda.com', '--wait'], t.ctx)).toBe(0);
    expect(t.api.llamadas.find((c) => c.method === 'POST')!.body).toEqual({ hostname: 'mitienda.com', project: 'tienda' });
    expect(t.esperas).toEqual([15000, 15000]);
    expect(t.out.join('\n')).toContain('✔ https://www.mitienda.com en el aire.');
  });

  it('add --wait muestra cada cambio de estado una vez (CNAME → certificado)', async () => {
    const esperando = { ...activo, status: 'pending', cf_status: 'pending', routed: false, status_message: 'Esperando que cargues el CNAME' };
    const emitiendo = {
      ...esperando,
      cf_status: 'active',
      status_message: 'Emitiendo el certificado (automático, no tenés que hacer nada)',
    };
    const t = await proyecto({ dominios: [[esperando], [esperando], [emitiendo], [activo]] });
    expect(await main(['domains', 'add', 'mitienda.com', '--wait'], t.ctx)).toBe(0);
    const texto = t.out.join('\n');
    expect(texto.match(/www\.mitienda\.com: Esperando que cargues el CNAME/g)).toHaveLength(1);
    expect(texto).toContain('www.mitienda.com: Emitiendo el certificado (automático, no tenés que hacer nada)');
    expect(texto).toContain('✔ https://www.mitienda.com en el aire.');
    expect(t.esperas).toEqual([15000, 15000, 15000]);
  });

  it('list con una API vieja (TXT en dns_records, sin optional_records): sigue mostrando todo', async () => {
    const viejo = {
      ...activo, status: 'pending', routed: false,
      dns_records: [
        { type: 'CNAME', name: 'www.mitienda.com', value: 'fallback.hermescdn.app', purpose: 'hostname', status: 'pending' },
        { type: 'TXT', name: '_acme-challenge.www.mitienda.com', value: 'ssl-1', purpose: 'hostname_ssl', status: 'pending' },
      ],
    };
    const t = await proyecto({ dominios: [[viejo]] });
    expect(await main(['domains', 'list'], t.ctx)).toBe(0);
    const texto = t.out.join('\n');
    expect(texto).toMatch(/TXT\s+_acme-challenge\.www\.mitienda\.com/);
    expect(texto).not.toContain('Opcional —');
  });

  it('add --wait corta si Cloudflare da error', async () => {
    const t = await proyecto({ dominios: [[{ ...activo, status: 'error', ssl_status: 'validation_timed_out' }]] });
    expect(await main(['domains', 'add', 'www.mitienda.com', '--wait'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/quedó con error/);
  });

  it('list y remove', async () => {
    const t = await proyecto({ dominios: [[activo]] });
    expect(await main(['domains', 'list'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('● activo  www.mitienda.com');
    expect(await main(['domains', 'remove', 'www.mitienda.com'], t.ctx)).toBe(1);
    expect(await main(['domains', 'remove', 'www.mitienda.com', '--yes'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Sacados: www.mitienda.com, checkout.mitienda.com');
  });
});

/** git falso: `HEAD`, branch, status y lo que contesta `merge-base --is-ancestor`. */
function gitFalso(
  t: Awaited<ReturnType<typeof proyecto>>,
  g: { head?: string; branch?: string; sucio?: boolean; ancestro?: number } = {},
) {
  const llamadas: string[][] = [];
  t.ctx.capture = async (cmd, args) => {
    llamadas.push([cmd, ...args]);
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { code: 0, stdout: `${g.head ?? 'b'.repeat(40)}\n` };
    if (args[0] === 'rev-parse') return { code: 0, stdout: `${g.branch ?? 'main'}\n` };
    if (args[0] === 'status') return { code: 0, stdout: g.sucio ? ' M app/page.tsx\n' : '' };
    if (args[0] === 'merge-base') return { code: g.ancestro ?? 0, stdout: '' };
    return { code: 1, stdout: '' };
  };
  return llamadas;
}

describe('hermes deploy — en equipo', () => {
  const ACTIVO = { git_commit: 'a'.repeat(40), git_branch: 'feat/vieja', created_by: 'beto@agencia.com' };

  it('manda commit, branch y si está sucio; detecta la ruta de revalidación', async () => {
    const t = await proyecto();
    gitFalso(t, { branch: 'main' });
    await mkdir(join(t.cwd, 'app/api/hermes/revalidate'), { recursive: true });
    await writeFile(join(t.cwd, 'app/api/hermes/revalidate/route.ts'), 'export {}');
    expect(await main(['deploy'], t.ctx)).toBe(0);
    const crear = t.api.llamadas.find((c) => c.method === 'POST' && c.path.endsWith('/deployments'))!;
    expect(crear.body.git).toEqual({ commit: 'b'.repeat(40), branch: 'main', dirty: false });
    expect(crear.body.hermes).toEqual({ revalidate_path: '/api/hermes/revalidate' });
    expect(t.out.join('\n')).toContain('Commit:   bbbbbbb (main)');
  });

  it('sin git (no es un repo): deploya igual, sin git en el manifest', async () => {
    const t = await proyecto();
    t.ctx.capture = async () => ({ code: 128, stdout: '' });
    expect(await main(['deploy'], t.ctx)).toBe(0);
    const crear = t.api.llamadas.find((c) => c.method === 'POST' && c.path.endsWith('/deployments'))!;
    expect(crear.body).not.toHaveProperty('git');
  });

  it('el deploy activo es de un commit que no está en tu branch: avisa quién, cuándo y qué; sin terminal exige --yes', async () => {
    const t = await proyecto({ activo: ACTIVO });
    const git = gitFalso(t, { ancestro: 1 });
    expect(await main(['deploy'], t.ctx)).toBe(1);
    const err = t.err.join('\n');
    expect(err).toMatch(
      /El deploy activo de producción es de beto@agencia\.com, .*, commit aaaaaaa \(branch feat\/vieja\), y ese commit no está en tu branch\. Si deployás, pisás esos cambios\./,
    );
    expect(err).toMatch(/--yes \(o --force\)/);
    expect(git).toContainEqual(['git', 'merge-base', '--is-ancestor', 'a'.repeat(40), 'HEAD']);
    // No se buildeó ni subió nada.
    expect(t.procesos).toEqual([]);
    expect(t.api.llamadas.some((c) => c.method === 'POST' && c.path.endsWith('/deployments'))).toBe(false);

    expect(await main(['deploy', '--force'], t.ctx)).toBe(0);
  });

  it('interactivo: pregunta; si dice que no, no sube nada', async () => {
    const t = await proyecto({ activo: ACTIVO, interactive: true, respuestas: ['n'] });
    gitFalso(t, { ancestro: 1 });
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Cancelado: no se subió nada.');
    expect(t.api.llamadas.some((c) => c.method === 'POST' && c.path.endsWith('/deployments'))).toBe(false);
  });

  it('el commit del activo no existe en tu copia local: sugiere git fetch', async () => {
    const t = await proyecto({ activo: ACTIVO });
    gitFalso(t, { ancestro: 128 });
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/no está en tu copia local: corré `git fetch`/);
  });

  it('el activo es ancestro de tu HEAD (o el mismo commit): no avisa', async () => {
    const t = await proyecto({ activo: ACTIVO });
    gitFalso(t, { ancestro: 0 });
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(t.err.join('\n')).not.toMatch(/pisás/);
    const u = await proyecto({ activo: { ...ACTIVO, git_commit: 'b'.repeat(40) } });
    const git = gitFalso(u);
    expect(await main(['deploy'], u.ctx)).toBe(0);
    expect(git.some((a) => a[1] === 'merge-base')).toBe(false);
  });

  it('cambios sin commitear: avisa y pide confirmación (--yes sigue)', async () => {
    const t = await proyecto();
    gitFalso(t, { sucio: true });
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/cambios sin commitear/);
    expect(await main(['deploy', '--yes'], t.ctx)).toBe(0);
    const crear = t.api.llamadas.find((c) => c.method === 'POST' && c.path.endsWith('/deployments'))!;
    expect(crear.body.git.dirty).toBe(true);
  });

  it('HERMES_DEPLOY_TOKEN: deploya sin login, con el token de deploy', async () => {
    const t = await proyecto();
    await rm(t.configDir, { recursive: true, force: true }); // sin `hermes login`
    t.ctx.env = { ...t.ctx.env, HERMES_DEPLOY_TOKEN: HDT };
    expect(await main(['deploy'], t.ctx)).toBe(0);
    expect(t.api.llamadas.every((c) => c.auth === `Bearer ${HDT}`)).toBe(true);
    expect(t.out.join('\n')).toContain('Con:      HERMES_DEPLOY_TOKEN');
    // El token de deploy no llega al build.
    for (const p of t.procesos) expect(p.env.HERMES_DEPLOY_TOKEN).toBeUndefined();
  });

  it('HERMES_DEPLOY_TOKEN con un project.json que apunta a otra API → no manda el token', async () => {
    const t = await proyecto();
    await rm(t.configDir, { recursive: true, force: true });
    await writeFile(
      join(t.cwd, '.hermes/project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.evil.example', public_token_id: 1, private_token_id: 2, linked_at: 'x' }),
    );
    t.ctx.env = { ...t.ctx.env, HERMES_DEPLOY_TOKEN: HDT };
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/apunta a https:\/\/api\.evil\.example, no a https:\/\/api\.pow\.la.*--api <url>.*HERMES_API/s);
    expect(t.api.llamadas).toEqual([]);
    expect(t.procesos).toEqual([]);
  });

  it('HERMES_DEPLOY_TOKEN con otra API elegida a mano (--api o HERMES_API) → deploya', async () => {
    for (const elegir of ['flag', 'env'] as const) {
      const t = await proyecto();
      await rm(t.configDir, { recursive: true, force: true });
      await writeFile(
        join(t.cwd, '.hermes/project.json'),
        JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.agencia.example', public_token_id: 1, private_token_id: 2, linked_at: 'x' }),
      );
      t.ctx.env = { ...t.ctx.env, HERMES_DEPLOY_TOKEN: HDT, ...(elegir === 'env' ? { HERMES_API: 'https://api.agencia.example' } : {}) };
      const argv = elegir === 'flag' ? ['deploy', '--api', 'https://api.agencia.example'] : ['deploy'];
      expect(await main(argv, t.ctx)).toBe(0);
      expect(t.api.llamadas.every((c) => c.auth === `Bearer ${HDT}`)).toBe(true);
    }
  });

  it('HERMES_DEPLOY_TOKEN que no es hdt_ → error claro', async () => {
    const t = await proyecto();
    t.ctx.env = { ...t.ctx.env, HERMES_DEPLOY_TOKEN: 'hct_otro' };
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/no es un token de deploy/);
  });

  it('deployments muestra commit, branch y quién deployó', async () => {
    const t = await proyecto({ activo: { ...ACTIVO, git_dirty: true } });
    expect(await main(['deployments'], t.ctx)).toBe(0);
    const texto = t.out.join('\n');
    expect(texto).toMatch(/● #6\s+active\s+prod\s+aaaaaaa \(feat\/vieja\)\*.*beto@agencia\.com/);
    expect(texto).toMatch(/○ #5\s+superseded\s+prod\s+—/);
  });
});

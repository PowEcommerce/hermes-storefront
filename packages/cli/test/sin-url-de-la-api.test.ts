import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { API_DEFAULT } from '../src/context';
import { CredentialsStore } from '../src/credentials';
import { SESION, apiFalsa, ctxDePrueba } from './helpers';

// La URL de la API de Hermes es interna: ningún mensaje de la CLI (salida,
// errores, ayuda, prompts) ni lo que escribe en el proyecto (.env,
// .hermes/project.json) la muestra. Se nombra «Hermes».
const HOST = new URL(API_DEFAULT).host;
const PST = 'pst_' + '1'.repeat(40);
const PSK = 'psk_' + '2'.repeat(40);

/** Lo mínimo de /api/cli/** para recorrer los comandos principales. */
function apiDeHermes() {
  return apiFalsa((c) => {
    if (c.path === '/api/cli/device/code')
      return {
        body: {
          device_code: 'dev-1',
          user_code: 'BCDF-GHJK',
          // El link del admin lo manda la API; acá uno neutro para medir sólo la CLI.
          verification_uri: 'https://admin.ejemplo.test/cli',
          verification_uri_complete: 'https://admin.ejemplo.test/cli?code=BCDF-GHJK',
          expires_in: 600,
          interval: 5,
        },
      };
    if (c.path === '/api/cli/device/token')
      return {
        body: { access_token: SESION.token, token_type: 'Bearer', expires_in: 2592000, scope: 'cli', user: { email: SESION.email, name: 'Ana' } },
      };
    if (c.path === '/api/v2/categories/header') return { body: { categories: [{ id: 1, slug: 'remeras' }] } };
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    if (c.path === '/api/cli/logout') return { body: { success: true } };
    if (c.path === '/api/cli/me')
      return {
        body: {
          user: { id: 7, email: SESION.email, name: 'Ana' },
          is_staff: false,
          token: { prefix: 'hct_aaaaaaaa', client_name: 'x', expires_at: SESION.expires_at },
          tenants: [{ tenant: 'mimarca', name: 'Mimarca', role: 'admin', can_link: true }],
        },
      };
    if (c.path === '/api/cli/tenants/mimarca/tokens')
      return {
        body: {
          storefront_tokens: [
            { id: 1, name: 'mimarca · dev', token_prefix: PST.slice(0, 12), kind: 'public', revoked_at: null, created_by: SESION.email, own: true, revocable: true, purpose: 'dev' },
            { id: 2, name: 'mimarca · dev (servidor)', token_prefix: PSK.slice(0, 12), kind: 'private', revoked_at: null, created_by: SESION.email, own: true, revocable: true, purpose: 'dev' },
          ],
        },
      };
    if (c.path === '/api/cli/tenants/mimarca/link')
      return {
        status: 201,
        body: {
          tenant: 'mimarca',
          // Como la manda la API hoy: la CLI no la escribe ni la muestra.
          api_url: `${API_DEFAULT}/api`,
          project_name: 'mimarca',
          purpose: 'dev',
          localhost: true,
          rotated: false,
          revoked_token_ids: [],
          public_token: { id: 1, name: 'mimarca · dev', token_prefix: PST.slice(0, 12), token: PST },
          private_token: { id: 2, name: 'mimarca · dev (servidor)', token_prefix: PSK.slice(0, 12), scopes: ['webhooks:manage'], token: PSK },
          domains: [],
          revalidate: null,
          warnings: [],
          env: { HERMES_TENANT: 'mimarca', HERMES_API_URL: `${API_DEFAULT}/api`, HERMES_PUBLIC_TOKEN: PST, HERMES_PRIVATE_TOKEN: PSK },
        },
      };
    return undefined;
  });
}

const salida = (t: { out: string[]; err: string[] }) => [...t.out, ...t.err].join('\n');

describe('la CLI no muestra la URL de la API de Hermes', () => {
  it('ayuda, login, whoami (texto y --json), link, env pull, dev, tokens y logout', async () => {
    const api = apiDeHermes();
    const t = await ctxDePrueba(api.fetch, { interactive: true });
    await writeFile(join(t.cwd, 'package.json'), JSON.stringify({ name: 'tienda', scripts: { dev: 'next dev' } }));
    await mkdir(join(t.cwd, 'node_modules'));

    for (const argv of [
      ['--help'],
      ['login'],
      ['whoami'],
      ['whoami', '--json'],
      ['link', '--tenant', 'mimarca'],
      ['env', 'pull'],
      ['dev', '--port', '4100'],
      ['tokens'],
      ['logout'],
      ['whoami'], // sin sesión: el error tampoco
    ])
      await main(argv, t.ctx);

    const texto = salida(t);
    expect(texto).toContain('entraste como ana@agencia.com en Hermes.');
    expect(texto).toContain('Ana <ana@agencia.com> en Hermes');
    expect(texto).toContain('Entorno:  producción');
    expect(texto).toContain('Saliste de Hermes');
    expect(texto).toContain('No estás logueado en Hermes. Corré `hermes login`.');
    expect(texto).not.toContain(HOST);
    expect(texto).not.toMatch(/pow\.la/);
    // Lo que queda escrito en el proyecto (se commitea / lo ve la agencia).
    expect(await readFile(join(t.cwd, '.env'), 'utf8')).not.toContain(HOST);
    expect(await readFile(join(t.cwd, '.hermes', 'project.json'), 'utf8')).not.toContain(HOST);
    // ...y todo sigue yendo a la API de Hermes.
    expect(api.llamadas.some((c) => c.path === '/api/cli/tenants/mimarca/link')).toBe(true);
  });

  it('sin red: el error no muestra la URL', async () => {
    const fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof globalThis.fetch;
    const t = await ctxDePrueba(fetch);
    await new CredentialsStore(t.configDir).guardar(API_DEFAULT, SESION);
    expect(await main(['whoami'], t.ctx)).toBe(1);
    expect(salida(t)).toContain('No pude conectarme con Hermes');
    expect(salida(t)).not.toContain(HOST);
  });

  it('con otra API (desarrollo interno, --api / HERMES_API) sí la muestra', async () => {
    const t = await ctxDePrueba(apiDeHermes().fetch);
    t.ctx.env.HERMES_API = 'https://api.ejemplo.test';
    expect(await main(['whoami'], t.ctx)).toBe(1);
    expect(salida(t)).toContain('No estás logueado en https://api.ejemplo.test. Corré `hermes login --api https://api.ejemplo.test`.');
  });

  it('un project.json viejo (con la URL) sigue andando', async () => {
    const t = await ctxDePrueba(apiDeHermes().fetch);
    await new CredentialsStore(t.configDir).guardar(API_DEFAULT, SESION);
    await mkdir(join(t.cwd, '.hermes'));
    await writeFile(
      join(t.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'mimarca', api: API_DEFAULT, linked_at: 'x' }),
    );
    expect(await main(['tokens'], t.ctx)).toBe(0);
    expect(salida(t)).not.toContain(HOST);
  });
});

import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore, normalizarApi } from '../src/credentials';
import { SESION, apiFalsa, ctxDePrueba } from './helpers';

const CODE = {
  device_code: 'dev-123',
  user_code: 'BCDF-GHJK',
  verification_uri: 'https://hermes.pow.la/admin/cli',
  verification_uri_complete: 'https://hermes.pow.la/admin/cli?code=BCDF-GHJK',
  expires_in: 600,
  interval: 5,
};
const TOKEN = {
  access_token: 'hct_' + 'b'.repeat(40),
  token_type: 'Bearer',
  expires_in: 2592000,
  scope: 'cli',
  user: { email: 'ana@agencia.com', name: 'Ana' },
};

/** Responde el sondeo con la secuencia dada (errores RFC 8628 o 'ok'). */
function flujo(secuencia: Array<string | { error: string; interval?: number }>) {
  return apiFalsa((c) => {
    if (c.path === '/api/cli/device/code') return { body: CODE };
    if (c.path === '/api/cli/device/token') {
      const s = secuencia.shift() ?? 'ok';
      if (s === 'ok') return { body: TOKEN };
      const e = typeof s === 'string' ? { error: s } : s;
      return { status: 400, body: { ...e, error_description: e.error } };
    }
    if (c.path === '/api/cli/logout') return { body: { success: true } };
    return undefined;
  });
}

describe('hermes login', () => {
  it('device flow: muestra el código, abre el navegador, respeta interval y slow_down, guarda la credencial (600)', async () => {
    const api = flujo(['authorization_pending', { error: 'slow_down', interval: 10 }, 'authorization_pending', 'ok']);
    const t = await ctxDePrueba(api.fetch, { interactive: true });
    expect(await main(['login'], t.ctx)).toBe(0);

    expect(t.out.join('\n')).toContain('BCDF-GHJK');
    expect(t.abiertos).toEqual([CODE.verification_uri_complete]);
    expect(t.esperas).toEqual([5000, 5000, 10000, 10000]);
    expect(api.llamadas[0]).toMatchObject({
      method: 'POST',
      path: '/api/cli/device/code',
      body: { client_name: 'hermes-cli test' },
    });
    expect(api.llamadas.at(-1)?.body).toEqual({
      device_code: 'dev-123',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    const path = join(t.configDir, 'credentials.json');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const j = JSON.parse(await readFile(path, 'utf8'));
    expect(j.default_api).toBe('https://api.pow.la');
    expect(j.sessions['https://api.pow.la']).toMatchObject({
      token: TOKEN.access_token,
      email: 'ana@agencia.com',
    });
    expect(t.out.join('\n')).toContain('entraste como ana@agencia.com');
  });

  it('--api de otra API y --no-browser', async () => {
    const api = flujo(['ok']);
    const t = await ctxDePrueba(api.fetch, { interactive: true });
    expect(
      await main(['login', '--api', 'https://api.ejemplo.test/api/', '--no-browser'], t.ctx),
    ).toBe(0);
    expect(t.abiertos).toEqual([]);
    expect(api.llamadas[0].path).toBe('/api/cli/device/code');
    const s = new CredentialsStore(t.configDir);
    expect((await s.sesion('https://api.ejemplo.test'))?.token).toBe(TOKEN.access_token);
  });

  it('expired_token → mensaje claro y código 1, sin credencial', async () => {
    const t = await ctxDePrueba(flujo(['authorization_pending', 'expired_token']).fetch);
    expect(await main(['login'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/venció/);
    expect(await new CredentialsStore(t.configDir).sesion('https://api.pow.la')).toBeNull();
  });

  it('access_denied → rechazado desde el admin', async () => {
    const t = await ctxDePrueba(flujo(['access_denied']).fetch);
    expect(await main(['login'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/rechazó/);
  });

  it('sin red: error legible', async () => {
    const fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof globalThis.fetch;
    const t = await ctxDePrueba(fetch);
    expect(await main(['login'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/No pude conectarme/);
  });

  it('logout revoca en la API y borra la credencial local', async () => {
    const api = flujo([]);
    const t = await ctxDePrueba(api.fetch);
    await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
    expect(await main(['logout'], t.ctx)).toBe(0);
    expect(api.llamadas[0]).toMatchObject({
      method: 'POST',
      path: '/api/cli/logout',
      auth: `Bearer ${SESION.token}`,
    });
    expect(await new CredentialsStore(t.configDir).sesion('https://api.pow.la')).toBeNull();
  });

  it('normalizarApi', () => {
    expect(normalizarApi('https://api.pow.la/api/')).toBe('https://api.pow.la');
    expect(normalizarApi('http://localhost:4000')).toBe('http://localhost:4000');
    expect(() => normalizarApi('http://api.pow.la')).toThrow(/https/);
  });
});

describe('hermes whoami', () => {
  it('sin sesión pide login', async () => {
    const t = await ctxDePrueba(apiFalsa(() => undefined).fetch);
    expect(await main(['whoami'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/hermes login/);
  });

  it('401 de la API → sesión vencida', async () => {
    const t = await ctxDePrueba(apiFalsa(() => ({ status: 401, body: { error: 'x' } })).fetch);
    await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
    expect(await main(['whoami'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/venció o se revocó/);
  });

  it('sesión acotada: lista sólo las cuentas autorizadas y sugiere `hermes login`', async () => {
    const t = await ctxDePrueba(
      apiFalsa((c) =>
        c.path === '/api/cli/me'
          ? {
              body: {
                user: { id: 7, email: SESION.email, name: 'Ana' },
                is_staff: false,
                token: {
                  prefix: 'hct_aaaaaaaa',
                  client_name: 'x',
                  expires_at: SESION.expires_at,
                  all_tenants: false,
                  tenants: ['mimarca'],
                },
                tenants: [{ tenant: 'mimarca', name: 'Mimarca', role: 'admin', can_link: true }],
              },
            }
          : undefined,
      ).fetch,
    );
    await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
    expect(await main(['whoami'], t.ctx)).toBe(0);
    const out = t.out.join('\n');
    expect(out).toContain('Marcas autorizadas en esta sesión:');
    expect(out).toContain('mimarca');
    expect(out).toMatch(/hermes login.*marcala/);
  });
});

describe('hermes login — cuentas autorizadas', () => {
  it('muestra las cuentas que se autorizaron al aprobar', async () => {
    const api = apiFalsa((c) => {
      if (c.path === '/api/cli/device/code') return { body: CODE };
      if (c.path === '/api/cli/device/token')
        return { body: { ...TOKEN, all_tenants: false, tenants: ['tercera', 'mimarca'] } };
      return undefined;
    });
    const t = await ctxDePrueba(api.fetch);
    expect(await main(['login', '--no-browser'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Cuentas autorizadas: tercera, mimarca.');
  });
});

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createStorefrontClient,
  DEFAULT_USER_AGENT,
  SDK_VERSION,
} from '../src';
import { createStorefrontClient as createNextClient } from '../src/next';
import { fetchFalso, PSK, PST } from './helpers';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

// El WAF de api.pow.la da 403 a los pedidos sin User-Agent, y el fetch de un
// Worker de Cloudflare no manda ninguno: el SDK pone el suyo.
describe('User-Agent', () => {
  it('SDK_VERSION coincide con el package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);
    expect(DEFAULT_USER_AGENT).toBe(`hermes-storefront/${pkg.version}`);
  });

  it('por defecto manda hermes-storefront/<versión> (público y privado)', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: { id: 'cs_1' } }));
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    await pow.config.get();
    await pow.checkoutSessions.get('cs_1');
    expect(llamadas).toHaveLength(2);
    for (const l of llamadas)
      expect(l.headers['user-agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('respeta el User-Agent del cliente (`headers`), en cualquier capitalización', async () => {
    const { fetch, llamadas } = fetchFalso();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      headers: { 'user-agent': 'mi-tienda/1.0' },
      fetch,
    });
    await pow.config.get();
    expect(llamadas[0].headers['user-agent']).toBe('mi-tienda/1.0');
  });

  it('respeta el User-Agent por pedido (`options.headers`)', async () => {
    const { fetch, llamadas } = fetchFalso();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      fetch,
    });
    await pow.config.get({ headers: { 'User-Agent': 'por-pedido/2.0' } });
    expect(llamadas[0].headers['user-agent']).toBe('por-pedido/2.0');
  });

  it('el adaptador /next también lo manda', async () => {
    const { fetch, llamadas } = fetchFalso();
    const pow = createNextClient({ tenant: 'mimarca', publicToken: PST, fetch });
    await pow.config.get();
    expect(llamadas[0].headers['user-agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('en el navegador no lo agrega (el browser manda el suyo)', async () => {
    (globalThis as { window?: unknown }).window = {};
    const { fetch, llamadas } = fetchFalso();
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await pow.config.get();
    expect(llamadas[0].headers['user-agent']).toBeUndefined();
  });
});

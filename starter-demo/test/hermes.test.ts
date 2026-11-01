import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_API_URL } from '@hermesecommerce/storefront';

vi.mock('server-only', () => ({}));
// El subpath /next suma las opciones de caché de Next (y necesita next/cache,
// que fuera de Next no resuelve): para la URL alcanza con el core del SDK.
vi.mock('@hermesecommerce/storefront/next', async () => {
  const sdk = await import('@hermesecommerce/storefront');
  return { createStorefrontClient: sdk.createStorefrontClient };
});

// HERMES_API_URL es opcional: sin ella (como queda el .env de `hermes link`
// y el .env.example) la tienda le pega a la API de Hermes, el default del SDK.
describe('lib/hermes sin HERMES_API_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([undefined, '', '  '])('HERMES_API_URL=%j → la API de Hermes', async (valor) => {
    vi.stubEnv('HERMES_TENANT', 'mimarca');
    vi.stubEnv('HERMES_PUBLIC_TOKEN', 'pst_' + '1'.repeat(40));
    if (valor === undefined) delete process.env.HERMES_API_URL;
    else vi.stubEnv('HERMES_API_URL', valor);
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      llamadas.push(String(url));
      return new Response(JSON.stringify({ currency: 'ARS' }), { headers: { 'content-type': 'application/json' } });
    });
    const { hermes } = await import('../lib/hermes');
    await hermes.config.get();
    expect(llamadas).toEqual([`${DEFAULT_API_URL}/api/v2/storefront/config`]);
  });
});

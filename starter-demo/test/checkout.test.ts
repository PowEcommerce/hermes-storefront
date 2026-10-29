import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HermesApiError } from '@hermesecommerce/storefront';
import { esSitioLocal, urlsDeVuelta } from '../lib/checkout';

describe('urlsDeVuelta', () => {
  it.each([
    'http://localhost:3417',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
    'http://[::1]:3000',
    'https://mi-tienda.localhost',
    'http://mitienda.com', // sin https la API la rechaza igual
    'no-es-url',
  ])('%s → local, sin return_url/cancel_url', (site) => {
    expect(esSitioLocal(site)).toBe(true);
    expect(urlsDeVuelta(site)).toEqual({});
  });

  it('https de verdad → las dos URLs', () => {
    expect(urlsDeVuelta('https://mitienda.com/')).toEqual({
      return_url: 'https://mitienda.com/checkout/vuelta',
      cancel_url: 'https://mitienda.com/carrito',
    });
  });
});

// La Server Action, con la API, las cookies y el sitio de mentira.
const create = vi.fn();
const sitio = { url: 'http://localhost:3417' };
vi.mock('@/lib/hermes', () => ({ hermes: { checkoutSessions: { create: (b: unknown) => create(b) } } }));
vi.mock('@/lib/cookies', () => ({ leerCarrito: async () => 'crt_abc' }));
vi.mock('@/lib/site', () => ({ urlDelSitio: async () => sitio.url }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));

async function destinoDe(): Promise<string> {
  const { finalizarCompra } = await import('../app/checkout/actions');
  try {
    await finalizarCompra();
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error('no redirigió');
}

describe('finalizarCompra', () => {
  beforeEach(() => {
    create.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('desde localhost NO manda return_url ni cancel_url', async () => {
    sitio.url = 'http://localhost:3417';
    create.mockResolvedValue({ url: 'https://checkout.mimarca.test/s/cs_1' });
    expect(await destinoDe()).toBe('https://checkout.mimarca.test/s/cs_1');
    expect(create).toHaveBeenCalledWith({ cart_token: 'crt_abc' });
  });

  it('en el dominio de la tienda sí las manda', async () => {
    sitio.url = 'https://mitienda.com';
    create.mockResolvedValue({ url: 'https://checkout.mitienda.com/s/cs_2' });
    await destinoDe();
    expect(create).toHaveBeenCalledWith({
      cart_token: 'crt_abc',
      return_url: 'https://mitienda.com/checkout/vuelta',
      cancel_url: 'https://mitienda.com/carrito',
    });
  });

  it('si la API falla (HTML del WAF), a la URL va sólo un código y el detalle al log', async () => {
    sitio.url = 'https://mitienda.com';
    create.mockRejectedValue(
      new HermesApiError({
        status: 403,
        message: 'HTTP 403 en POST /api/v2/checkout_sessions',
        body: '<html><head><title>403 Forbidden</title></head></html>',
        request: { method: 'POST', path: '/api/v2/checkout_sessions' },
      }),
    );
    expect(await destinoDe()).toBe('/carrito?error=checkout');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[hermes]'), expect.stringContaining('403'));
  });
});

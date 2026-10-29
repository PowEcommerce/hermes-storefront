import { afterEach, describe, expect, it } from 'vitest';
import {
  createStorefrontClient,
  HermesApiError,
  HermesConfigError,
} from '../src';
import { fetchFalso, PSK, PST } from './helpers';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('headers por token', () => {
  it('público: X-Client-ID + X-Storefront-Token, nunca el privado', async () => {
    const { fetch, llamadas } = fetchFalso();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    await pow.config.get();
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/storefront/config');
    expect(llamadas[0].headers['x-client-id']).toBe('mimarca');
    expect(llamadas[0].headers['x-storefront-token']).toBe(PST);
    expect(llamadas[0].headers['x-storefront-private-token']).toBeUndefined();
  });

  it('privado: sólo X-Storefront-Private-Token (sin el público)', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      body: { id: 'cs_1', status: 'open' },
    }));
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    await pow.checkoutSessions.get('cs_1');
    await pow.webhooks.list();
    for (const l of llamadas) {
      expect(l.headers['x-storefront-private-token']).toBe(PSK);
      expect(l.headers['x-storefront-token']).toBeUndefined();
    }
    expect(llamadas[0].url).toBe(
      'https://api.pow.la/api/v2/checkout_sessions/cs_1',
    );
    expect(llamadas[1].url).toBe(
      'https://api.pow.la/api/v2/webhook_subscriptions',
    );
  });

  it('checkoutSessions.create va con el PÚBLICO (dominios permitidos)', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      status: 201,
      body: { id: 'cs_1', url: 'u', expires_at: 'x' },
    }));
    const pow = createStorefrontClient({
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    const s = await pow.checkoutSessions.create({
      cart_token: 'crt_1',
      return_url: 'https://a.com/ok',
      cancel_url: 'https://a.com/cart',
    });
    expect(s.id).toBe('cs_1');
    expect(llamadas[0].method).toBe('POST');
    expect(llamadas[0].headers['x-storefront-token']).toBe(PST);
    expect(llamadas[0].headers['x-storefront-private-token']).toBeUndefined();
    expect(llamadas[0].body).toEqual({
      cart_token: 'crt_1',
      return_url: 'https://a.com/ok',
      cancel_url: 'https://a.com/cart',
    });
  });

  it('checkoutSessions.create sin return_url/cancel_url (desarrollo en localhost)', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      status: 201,
      body: { id: 'cs_1', url: 'u', expires_at: 'x' },
    }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await pow.checkoutSessions.create({ cart_token: 'crt_1' });
    expect(llamadas[0].body).toEqual({ cart_token: 'crt_1' });
  });

  it('método privado sin privateToken: error claro', async () => {
    const { fetch } = fetchFalso();
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await expect(pow.webhooks.list()).rejects.toThrow(/privateToken/);
  });

  it('apiUrl configurable (con o sin /api al final)', async () => {
    const { fetch, llamadas } = fetchFalso();
    await createStorefrontClient({
      publicToken: PST,
      apiUrl: 'https://api.ejemplo.test/api/',
      fetch,
    }).config.get();
    expect(llamadas[0].url).toBe(
      'https://api.ejemplo.test/api/v2/storefront/config',
    );
  });

  it('valida los prefijos de los tokens', () => {
    const { fetch } = fetchFalso();
    expect(() => createStorefrontClient({ publicToken: PSK, fetch })).toThrow(
      /PRIVADO/,
    );
    expect(() =>
      createStorefrontClient({ publicToken: PST, privateToken: PST, fetch }),
    ).toThrow(/psk_/);
    expect(() => createStorefrontClient({ fetch })).toThrow(HermesConfigError);
  });
});

describe('psk_ en el navegador', () => {
  it('crear el cliente con privateToken en el navegador tira', () => {
    (globalThis as { window?: unknown }).window = {};
    const { fetch } = fetchFalso();
    expect(() =>
      createStorefrontClient({ publicToken: PST, privateToken: PSK, fetch }),
    ).toThrow(/SÓLO server-side/);
  });

  it('sin privateToken, en el navegador anda', async () => {
    (globalThis as { window?: unknown }).window = {};
    const { fetch, llamadas } = fetchFalso();
    await createStorefrontClient({
      publicToken: PST,
      fetch,
    }).catalog.categories();
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/categories/header');
  });
});

describe('carrito', () => {
  it('addLine sin token crea el carrito y devuelve el crt_ del header', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      body: { success: true, message: 'ok', quantity_added: 1 },
      headers: { 'X-Cart-Token': 'crt_nuevo' },
    }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    const r = await pow.cart.addLine(null, { variant_id: 123, quantity: 1 });
    expect(r.cartToken).toBe('crt_nuevo');
    expect(llamadas[0].headers['x-cart-token']).toBeUndefined();
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/cart/add');
    expect(llamadas[0].body).toEqual({ variant_id: 123, quantity: 1 });
  });

  it('con token lo manda en X-Cart-Token y lo conserva', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: { success: true } }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    const r = await pow.cart.addLine('crt_viejo', { variant_id: 1 });
    expect(r.cartToken).toBe('crt_viejo');
    await pow.cart.updateLine('crt_viejo', 55, 3);
    await pow.cart.removeLine('crt_viejo', 55);
    expect(
      llamadas.map((l) => [l.method, l.url, l.headers['x-cart-token']]),
    ).toEqual([
      ['POST', 'https://api.pow.la/api/v2/cart/add', 'crt_viejo'],
      ['PATCH', 'https://api.pow.la/api/v2/cart/items/55', 'crt_viejo'],
      ['DELETE', 'https://api.pow.la/api/v2/cart/items/55', 'crt_viejo'],
    ]);
    expect(llamadas[1].body).toEqual({ quantity: 3 });
  });
});

describe('cuenta', () => {
  it('login devuelve la sesión de los headers y manda el carrito', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      body: { status: 'ok' },
      headers: {
        'X-Customer-Token': 'jwt.a.b',
        'X-Customer-Refresh': 'rft_x',
        'X-Customer-Refresh-Max-Age': '2592000',
      },
    }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    const r = await pow.account.login(
      { email: 'a@b.com', password: 'x' },
      { cartToken: 'crt_1' },
    );
    expect(r.session).toEqual({
      accessToken: 'jwt.a.b',
      refreshToken: 'rft_x',
      refreshMaxAge: 2592000,
    });
    expect(llamadas[0].headers['x-cart-token']).toBe('crt_1');
    await pow.account.orders('jwt.a.b', { page: 2 });
    expect(llamadas[1].url).toBe(
      'https://api.pow.la/api/v2/users/orders?page=2',
    );
    expect(llamadas[1].headers['x-customer-token']).toBe('jwt.a.b');
    await pow.account.refresh('rft_x');
    expect(llamadas[2].headers['x-customer-refresh']).toBe('rft_x');
  });
});

describe('catálogo', () => {
  it('serializa filtros: listas con coma, rango en JSON, arrays [] repetidos', async () => {
    const { fetch, llamadas } = fetchFalso();
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await pow.catalog.products({
      category: 'remeras',
      page_number: 2,
      multicolors: ['Negro', 'Blanco'],
      min_and_max_price: { min: 1000, max: 5000 },
      price: '1',
      Material: 'Algodón',
    });
    const u = new URL(llamadas[0].url);
    expect(u.pathname).toBe('/api/v2/products/category/remeras');
    expect(u.searchParams.get('multicolors')).toBe('Negro,Blanco');
    expect(u.searchParams.get('min_and_max_price')).toBe(
      '{"min":1000,"max":5000}',
    );
    expect(u.searchParams.get('Material')).toBe('Algodón');
    await pow.catalog.updateVariant('remera', [1, 2]);
    expect(
      new URL(llamadas[1].url).searchParams.getAll('option_ids[]'),
    ).toEqual(['1', '2']);
    await pow.catalog.product('remera básica');
    expect(llamadas[2].url).toBe(
      'https://api.pow.la/api/v2/items/remera%20b%C3%A1sica',
    );
    await pow.catalog.bySkus(['V27%S', '063343NE.J026']);
    const porSkus = new URL(llamadas[3].url);
    expect(porSkus.pathname).toBe('/api/v2/items');
    expect(porSkus.searchParams.get('skus')).toBe('V27%S,063343NE.J026');
    expect(pow.catalog.bySkus.cacheTags(['V27%S'])).toEqual(['products']);
  });

  it('cliente tipado genérico', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: { items: [] } }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    const { data } = await pow.api.GET('/api/v2/items/{id}/related', {
      path: { id: 'remera' },
    });
    expect(data).toEqual({ items: [] });
    expect(llamadas[0].url).toBe(
      'https://api.pow.la/api/v2/items/remera/related',
    );
  });
});

describe('normalización de errores', () => {
  const casos: [string, number, unknown, string, string[]][] = [
    [
      '{error}',
      404,
      { error: 'Sesión de checkout no encontrada' },
      'not_found',
      ['Sesión de checkout no encontrada'],
    ],
    [
      '{errors:[]}',
      422,
      { errors: ['return_url: inválida', 'cart_token: inválido'] },
      'validation',
      ['return_url: inválida', 'cart_token: inválido'],
    ],
    [
      '{success:false,message}',
      422,
      { success: false, message: 'Sin stock' },
      'validation',
      ['Sin stock'],
    ],
    [
      '{ok:false,error,errors{}}',
      422,
      {
        ok: false,
        error: 'Revisá los datos',
        errors: { zipcode: ['inválido'] },
        next: 'shipping',
      },
      'validation',
      ['Revisá los datos', 'zipcode: inválido'],
    ],
    [
      '{status:error}',
      401,
      { status: 'error', message: 'Email o contraseña inválidos' },
      'unauthorized',
      ['Email o contraseña inválidos'],
    ],
    [
      'field_errors',
      422,
      { success: false, field_errors: { rating: 'requerido' } },
      'validation',
      ['rating: requerido'],
    ],
  ];
  for (const [nombre, status, body, code, errores] of casos) {
    it(nombre, async () => {
      const { fetch } = fetchFalso(() => ({ status, body }));
      const pow = createStorefrontClient({ publicToken: PST, fetch });
      const e = (await pow.cart.get('crt_1').catch((x) => x)) as HermesApiError;
      expect(e).toBeInstanceOf(HermesApiError);
      expect(e.status).toBe(status);
      expect(e.code).toBe(code);
      expect(e.errors).toEqual(errores);
      expect(e.message).toBe(errores.join(' · '));
      expect(e.body).toEqual(body);
      expect(e.request).toEqual({ method: 'GET', path: '/api/v2/cart' });
    });
  }

  it('429 con Retry-After y 500 con request_id', async () => {
    let n = 0;
    const { fetch } = fetchFalso(() =>
      n++ === 0
        ? {
            status: 429,
            body: { error: 'Demasiados pedidos' },
            headers: { 'Retry-After': '30' },
          }
        : {
            status: 500,
            body: { error: 'Error interno', request_id: 'req_9' },
          },
    );
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    const e1 = (await pow.config.get().catch((x) => x)) as HermesApiError;
    expect([e1.code, e1.retryAfter]).toEqual(['rate_limited', 30]);
    const e2 = (await pow.config.get().catch((x) => x)) as HermesApiError;
    expect([e2.code, e2.requestId]).toEqual(['server_error', 'req_9']);
  });

  it('cuerpo no JSON y error de red', async () => {
    const { fetch } = fetchFalso(() => ({
      status: 502,
      body: '<html>Bad gateway</html>',
    }));
    const e = (await createStorefrontClient({ publicToken: PST, fetch })
      .config.get()
      .catch((x) => x)) as HermesApiError;
    expect(e.status).toBe(502);
    expect(e.body).toBe('<html>Bad gateway</html>');
    // El HTML (WAF, balanceador) nunca es el mensaje.
    expect(e.message).toBe('HTTP 502 en GET /api/v2/storefront/config');
    expect(e.errors).toEqual([]);

    const caido = createStorefrontClient({
      publicToken: PST,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const e2 = (await caido.config.get().catch((x) => x)) as HermesApiError;
    expect([e2.status, e2.code]).toEqual([0, 'network_error']);
  });
});

describe('fetch global', () => {
  it('se resuelve en cada pedido (Next.js parchea globalThis.fetch después de crear el cliente)', async () => {
    const original = globalThis.fetch;
    const pow = createStorefrontClient({ tenant: 'mimarca', publicToken: PST });
    const { fetch, llamadas } = fetchFalso();
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    try {
      await pow.config.get();
      expect(llamadas).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

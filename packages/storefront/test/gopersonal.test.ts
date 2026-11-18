import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOPERSONAL_SDK_URL,
  GOPERSONAL_SW_FALLBACK,
  GOPERSONAL_SW_URL,
  goPersonalCartLines,
  goPersonalContextFor,
  goPersonalFrom,
  goPersonalIdentityCookie,
  parseGoPersonalIdentity,
} from '../src';
import { createGoPersonalServiceWorkerRoute as rutaDesdeNext } from '../src/next';
import {
  __resetGoPersonalForTests,
  consumeGoPersonalIdentity,
  createGoPersonalServiceWorkerRoute,
  goPersonalLogin,
  goPersonalLogout,
  goPersonalPage,
  loadGoPersonal,
  trackGoPersonalAddToCart,
  trackGoPersonalCart,
  trackGoPersonalProductView,
  trackGoPersonalPurchase,
  trackGoPersonalQuantityChange,
} from '../src/gopersonal';

// ---------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------

describe('goPersonalFrom', () => {
  it('prende el SDK sólo con sdk_enabled Y client id', () => {
    expect(
      goPersonalFrom({ gopersonal: { sdk_enabled: true, client_id: ' abc ', push_enabled: true } }),
    ).toEqual({ sdkEnabled: true, clientId: 'abc', pushEnabled: true });
    expect(
      goPersonalFrom({ gopersonal: { sdk_enabled: true, client_id: '', push_enabled: false } }),
    ).toEqual({ sdkEnabled: false, clientId: null, pushEnabled: false });
    expect(
      goPersonalFrom({ gopersonal: { sdk_enabled: false, client_id: 'abc', push_enabled: true } }),
    ).toEqual({ sdkEnabled: false, clientId: 'abc', pushEnabled: true });
  });

  it('sin la app (o con cualquier cosa) todo apagado', () => {
    const apagado = { sdkEnabled: false, clientId: null, pushEnabled: false };
    expect(goPersonalFrom({ nest: [] })).toEqual(apagado);
    expect(goPersonalFrom(null)).toEqual(apagado);
    expect(goPersonalFrom({ gopersonal: 'si' })).toEqual(apagado);
    expect(goPersonalFrom({ gopersonal: { sdk_enabled: 'true', client_id: 1 } })).toEqual(apagado);
  });
});

describe('goPersonalContextFor', () => {
  it('mapea las rutas del starter', () => {
    expect(goPersonalContextFor('/')).toEqual({ pageType: 'home' });
    expect(goPersonalContextFor('/categoria/remeras')).toEqual({
      pageType: 'category',
      category: 'remeras',
    });
    expect(goPersonalContextFor('/buscar')).toEqual({ pageType: 'search' });
    expect(goPersonalContextFor('/checkout/vuelta')).toEqual({ pageType: 'checkout' });
    expect(goPersonalContextFor('/pages/envios')).toEqual({ pageType: 'unknown' });
    expect(goPersonalContextFor('/buscarlo')).toEqual({ pageType: 'unknown' });
  });

  it('la PDP y el carrito mandan su propio contexto', () => {
    expect(goPersonalContextFor('/producto/remera')).toBeNull();
    expect(goPersonalContextFor('/carrito')).toBeNull();
  });

  it('acepta otras rutas', () => {
    expect(goPersonalContextFor('/p/remera', { product: '/p/' })).toBeNull();
    expect(goPersonalContextFor('/c/jeans', { category: '/c/' })).toEqual({
      pageType: 'category',
      category: 'jeans',
    });
  });
});

describe('goPersonalCartLines', () => {
  it('precio unitario en pesos (ga4_item.price, o centavos ÷ cantidad)', () => {
    expect(
      goPersonalCartLines([
        { item_id: 7, quantity: 2, price_cents: 9999800, image: 'a.jpg', ga4_item: { price: 49999 } },
        { item_id: 8, quantity: 3, price_cents: 3000, image: null, ga4_item: null },
        { item_id: 9, quantity: 0, price_cents: 0 },
      ]),
    ).toEqual([
      { productId: 7, quantity: 2, price: 49999, image: 'a.jpg' },
      { productId: 8, quantity: 3, price: 10, image: null },
    ]);
    expect(goPersonalCartLines(undefined)).toEqual([]);
  });
});

describe('cookie de identidad', () => {
  it('ida y vuelta', () => {
    const v = goPersonalIdentityCookie({ customerId: 42, email: 'a@ejemplo.test' });
    expect(v).not.toMatch(/[;,\s]/);
    expect(parseGoPersonalIdentity(v)).toEqual({
      type: 'login',
      customerId: '42',
      email: 'a@ejemplo.test',
    });
    expect(parseGoPersonalIdentity(goPersonalIdentityCookie('logout'))).toEqual({ type: 'logout' });
    expect(parseGoPersonalIdentity('basura')).toBeNull();
    expect(parseGoPersonalIdentity(encodeURIComponent('{"id":""}'))).toBeNull();
    expect(parseGoPersonalIdentity(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Navegador (window, document y el SDK de Go Personal de mentira)
// ---------------------------------------------------------------------------

class StorageFalso {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function navegador() {
  const llamadas: Array<[string, ...unknown[]]> = [];
  const opcionesDelSdk: Array<{ clientId: string; options: Record<string, unknown> }> = [];
  const sdk = {
    getContentByContext: (...a: unknown[]) => llamadas.push(['getContentByContext', ...a]),
    addInteraction: (...a: unknown[]) => llamadas.push(['addInteraction', ...a]),
    addInteractionState: (...a: unknown[]) => llamadas.push(['addInteractionState', ...a]),
    updateState: (...a: unknown[]) => llamadas.push(['updateState', ...a]),
    login: (...a: unknown[]) => llamadas.push(['login', ...a]),
    logout: (...a: unknown[]) => llamadas.push(['logout', ...a]),
    setSharedToken: () => llamadas.push(['setSharedToken']),
  };
  const w: Record<string, any> = {};
  const scripts: Array<Record<string, any>> = [];
  let cookie = '';
  const doc = {
    createElement: () => ({}) as Record<string, any>,
    head: { appendChild: (s: Record<string, any>) => scripts.push(s) },
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      const [par] = v.split(';');
      const [k] = par.split('=');
      const resto = cookie
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c && !c.startsWith(`${k}=`));
      if (!/Max-Age=0/.test(v)) resto.push(par);
      cookie = resto.join('; ');
    },
  };
  vi.stubGlobal('window', w);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', new StorageFalso());
  /** Simula que el <script> del SDK terminó de cargar. */
  const cargar = async () => {
    w.GSSDK = {
      default: function (clientId: string, options: Record<string, unknown>) {
        opcionesDelSdk.push({ clientId, options });
        return sdk;
      },
    };
    scripts[0]?.onload?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { llamadas, opcionesDelSdk, scripts, w, cargar };
}

describe('SDK en el navegador', () => {
  beforeEach(() => __resetGoPersonalForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetGoPersonalForTests();
  });

  it('fuera del navegador no hace nada ni tira', () => {
    expect(() => loadGoPersonal('abc')).not.toThrow();
    expect(() => trackGoPersonalProductView(1)).not.toThrow();
    expect(trackGoPersonalPurchase({ transactionId: 1 })).toBe(false);
    expect(consumeGoPersonalIdentity()).toBeNull();
  });

  it('carga el script async una sola vez y lo inicializa como la app de VTEX (provider Custom)', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    loadGoPersonal('cli_1');
    expect(n.scripts).toHaveLength(1);
    expect(n.scripts[0]).toMatchObject({ src: GOPERSONAL_SDK_URL, async: true });
    await n.cargar();
    expect(n.opcionesDelSdk).toEqual([
      {
        clientId: 'cli_1',
        options: { provider: 'Custom', singlePage: true, context: {}, readSharedSession: false },
      },
    ]);
    expect(n.w.gsSDK).toBeDefined();
    loadGoPersonal('cli_1');
    expect(n.scripts).toHaveLength(1);
  });

  it('sin client id no carga nada', () => {
    const n = navegador();
    loadGoPersonal('  ');
    expect(n.scripts).toHaveLength(0);
  });

  it('encola lo que llega antes de que cargue y lo manda en orden', async () => {
    const n = navegador();
    trackGoPersonalProductView(7665);
    loadGoPersonal('cli_1');
    trackGoPersonalAddToCart({ productId: 7665, quantity: 2, price: 49999 });
    expect(n.llamadas).toEqual([]);
    await n.cargar();
    expect(n.llamadas).toEqual([
      ['getContentByContext', 'product_detail', { product_id: '7665', singlePage: true }],
      ['addInteraction', { event: 'view', item: '7665' }],
      ['addInteraction', { event: 'cart', item: '7665', quantity: 2, price: 49999 }],
    ]);
    // Ya cargado: directo.
    goPersonalPage({ pageType: 'category', category: 'remeras' });
    expect(n.llamadas.at(-1)).toEqual([
      'getContentByContext',
      'category',
      { category: 'remeras', singlePage: true },
    ]);
  });

  it('si el SDK no carga, descarta la cola y no tira', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    trackGoPersonalProductView(1);
    n.scripts[0].onerror();
    expect(() => trackGoPersonalProductView(2)).not.toThrow();
    expect(n.llamadas).toEqual([]);
  });

  it('un error del SDK no rompe la página', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    n.w.gsSDK.addInteraction = () => {
      throw new Error('boom');
    };
    expect(() => trackGoPersonalAddToCart({ productId: 1, quantity: 1 })).not.toThrow();
  });

  it('cambio de cantidad: cart si sube, remove-cart si baja, nada si queda igual', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    trackGoPersonalQuantityChange({ productId: 5, from: 1, to: 3, price: 10 });
    trackGoPersonalQuantityChange({ productId: 5, from: 3, to: 0, price: 10 });
    trackGoPersonalQuantityChange({ productId: 5, from: 2, to: 2, price: 10 });
    expect(n.llamadas).toEqual([
      ['addInteraction', { event: 'cart', item: '5', quantity: 2, price: 10 }],
      ['addInteraction', { event: 'remove-cart', item: '5', quantity: 3, price: 10 }],
    ]);
  });

  it('carrito: contenido de la página cart + updateState; vacío = clean-cart', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    trackGoPersonalCart([
      { productId: 7, quantity: 2, price: 100, image: 'a.jpg' },
      { productId: 8, quantity: 1, price: 50 },
    ]);
    expect(n.llamadas).toEqual([
      [
        'getContentByContext',
        'cart',
        {
          cart_items: [
            { product_id: '7', quantity: 2 },
            { product_id: '8', quantity: 1 },
          ],
          singlePage: true,
        },
      ],
      [
        'updateState',
        {
          cart: {
            amountOfProducts: 3,
            totalAmount: 250,
            products: [
              { id: '7', price: 100, quantity: 2, image_url: 'a.jpg' },
              { id: '8', price: 50, quantity: 1, image_url: null },
            ],
          },
        },
      ],
    ]);
    n.llamadas.length = 0;
    trackGoPersonalCart([], { page: false });
    expect(n.llamadas).toEqual([['addInteraction', { event: 'clean-cart' }]]);
  });

  it('compra: addInteractionState cart con el transactionId, una sola vez por orden', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    expect(trackGoPersonalPurchase({ transactionId: 123 })).toBe(true);
    expect(trackGoPersonalPurchase({ transactionId: 123 })).toBe(false);
    expect(n.llamadas).toEqual([['addInteractionState', 'cart', { transactionId: '123' }]]);
  });

  it('login/logout', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    goPersonalLogin({ customerId: 9, email: 'a@ejemplo.test' });
    goPersonalLogout();
    expect(n.llamadas).toEqual([
      ['login', '9', { email: 'a@ejemplo.test', param_updateCartFromCustomer: true }],
      ['logout'],
    ]);
  });

  it('consume la cookie de identidad una sola vez', async () => {
    const n = navegador();
    loadGoPersonal('cli_1');
    await n.cargar();
    document.cookie = `hermes_gp_identity=${goPersonalIdentityCookie({ customerId: 3, email: 'b@ejemplo.test' })}; Path=/`;
    document.cookie = 'otra=1; Path=/';
    expect(consumeGoPersonalIdentity()).toEqual({
      type: 'login',
      customerId: '3',
      email: 'b@ejemplo.test',
    });
    expect(consumeGoPersonalIdentity()).toBeNull();
    expect(document.cookie).toBe('otra=1');
    expect(n.llamadas).toEqual([
      ['login', '3', { email: 'b@ejemplo.test', param_updateCartFromCustomer: true }],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Servidor: /gp-firebase.js
// ---------------------------------------------------------------------------

describe('createGoPersonalServiceWorkerRoute', () => {
  const SW = '"function" === typeof importScripts && importScripts("https://sdk.ejemplo.test/sw.js");';
  const req = () => new Request('https://tienda.ejemplo.test/gp-firebase.js');
  const clienteCon = (gopersonal: unknown) => {
    const get = vi.fn(async () => ({ nest: [], gopersonal }) as any);
    return { client: { config: { get } } as any, get };
  };
  const upstream = (cuerpo = SW, status = 200) =>
    vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(cuerpo, { status }));

  afterEach(() => vi.unstubAllGlobals());

  it('también se exporta desde /next', () => {
    expect(rutaDesdeNext).toBe(createGoPersonalServiceWorkerRoute);
  });

  it('con push prendido sirve el service worker como JS, cacheable, y no pide el original cada vez', async () => {
    const { client, get } = clienteCon({ sdk_enabled: true, client_id: 'x', push_enabled: true });
    const fetch = upstream();
    const GET = createGoPersonalServiceWorkerRoute({ client, fetch: fetch as any });
    const r = await GET(req());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=86400');
    expect(await r.text()).toBe(SW);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(GOPERSONAL_SW_URL);

    const r2 = await GET(req());
    expect(await r2.text()).toBe(SW);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('con push apagado, sin la app o sin config: 404 sin pedir el original', async () => {
    for (const gp of [
      { sdk_enabled: true, client_id: 'x', push_enabled: false },
      undefined,
    ]) {
      const { client } = clienteCon(gp);
      const fetch = upstream();
      const r = await createGoPersonalServiceWorkerRoute({ client, fetch: fetch as any })(req());
      expect(r.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    }
    const fetch = upstream();
    const caida = { config: { get: async () => Promise.reject(new Error('API caída')) } } as any;
    const r = await createGoPersonalServiceWorkerRoute({ client: caida, fetch: fetch as any })(req());
    expect(r.status).toBe(404);
  });

  it('si Go Personal falla sirve el contenido conocido (nunca HTML de error)', async () => {
    const { client } = clienteCon({ push_enabled: true });
    for (const fetch of [
      upstream('', 500),
      upstream('<html>error</html>'),
      vi.fn(async () => Promise.reject(new Error('red'))),
    ]) {
      const r = await createGoPersonalServiceWorkerRoute({ client, fetch: fetch as any })(req());
      expect(r.status).toBe(200);
      expect(await r.text()).toBe(GOPERSONAL_SW_FALLBACK);
    }
  });

  it('usa la Cache API del colo (caches.default) entre isolates', async () => {
    const guardado = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (k: Request) => guardado.get(k.url)?.clone()),
      put: vi.fn(async (k: Request, r: Response) => void guardado.set(k.url, r)),
    };
    vi.stubGlobal('caches', { default: cache });
    const { client } = clienteCon({ push_enabled: true });
    const fetch = upstream();
    await createGoPersonalServiceWorkerRoute({ client, fetch: fetch as any })(req());
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][0].url).toBe('https://tienda.ejemplo.test/gp-firebase.js?gp-upstream=1');
    // Otro isolate (otra instancia de la ruta, sin memoria): sale de la Cache API.
    const r = await createGoPersonalServiceWorkerRoute({ client, fetch: fetch as any })(req());
    expect(await r.text()).toBe(SW);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

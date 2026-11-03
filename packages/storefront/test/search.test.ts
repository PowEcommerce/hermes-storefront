import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientIpFrom,
  createStorefrontClient,
  deviceFromWidth,
  isAppEnabled,
  SEARCH_APP_SLUG,
  searchEventsBatch,
} from '../src';
import {
  createSearchEventsRoute as rutaDesdeNext,
  createStorefrontClient as clienteDeNext,
} from '../src/next';
import {
  createSearchEventsRoute,
  getSearchAttribution,
  sendSearchEvents,
  trackSearch,
  trackSearchAddToCart,
  trackSearchClick,
  trackSearchPurchase,
} from '../src/search';
import { fetchFalso, PST } from './helpers';

const apps = (estado: Record<string, unknown>) => ({ apps: estado });

describe('isAppEnabled', () => {
  it('sólo instalada Y prendida', () => {
    expect(
      isAppEnabled(
        apps({ [SEARCH_APP_SLUG]: { installed: true, enabled: true } }),
        SEARCH_APP_SLUG,
      ),
    ).toBe(true);
    expect(
      isAppEnabled(
        apps({ [SEARCH_APP_SLUG]: { installed: true, enabled: false } }),
        SEARCH_APP_SLUG,
      ),
    ).toBe(false);
    expect(isAppEnabled(apps({}), SEARCH_APP_SLUG)).toBe(false);
  });

  it('una forma rara nunca prende nada', () => {
    for (const raro of [
      null,
      undefined,
      'x',
      { apps: [] },
      { apps: { [SEARCH_APP_SLUG]: { installed: 'true', enabled: 1 } } },
      { apps: { [SEARCH_APP_SLUG]: null } },
    ])
      expect(isAppEnabled(raro, SEARCH_APP_SLUG)).toBe(false);
  });
});

describe('searchEventsBatch', () => {
  it('acepta { events }, una lista o un evento suelto; sólo tipos conocidos', () => {
    expect(
      searchEventsBatch({ events: [{ type: 'search' }, { type: 'otro' }] }),
    ).toEqual([{ type: 'search' }]);
    expect(searchEventsBatch([{ type: 'add-to-cart' }])).toHaveLength(1);
    expect(searchEventsBatch({ type: 'purchase-complete' })).toHaveLength(1);
    expect(searchEventsBatch('basura')).toEqual([]);
    expect(searchEventsBatch(null)).toEqual([]);
  });

  it('corta en 50', () => {
    const muchos = Array.from({ length: 80 }, () => ({ type: 'search' }));
    expect(searchEventsBatch(muchos)).toHaveLength(50);
  });
});

describe('clientIpFrom / deviceFromWidth', () => {
  it('CF-Connecting-IP, después X-Real-IP, después el primer X-Forwarded-For', () => {
    expect(
      clientIpFrom(
        new Headers({
          'cf-connecting-ip': '181.1.2.3',
          'x-forwarded-for': '9.9.9.9',
        }),
      ),
    ).toBe('181.1.2.3');
    expect(clientIpFrom(new Headers({ 'x-real-ip': '2800:810::1' }))).toBe(
      '2800:810::1',
    );
    expect(
      clientIpFrom(new Headers({ 'x-forwarded-for': '181.1.2.3, 203.0.113.9' })),
    ).toBe('181.1.2.3');
    expect(
      clientIpFrom(new Headers({ 'x-forwarded-for': '<script>' })),
    ).toBeNull();
    expect(clientIpFrom(new Headers())).toBeNull();
  });

  it('cortes de mobile/tablet/desktop', () => {
    expect(deviceFromWidth(375)).toBe('mobile');
    expect(deviceFromWidth(800)).toBe('tablet');
    expect(deviceFromWidth(1440)).toBe('desktop');
  });
});

describe('cliente: searchEnabled / appEnabled / searchConfig / searchEvents', () => {
  it('searchEnabled lee /v2/storefront/apps', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      body: apps({ [SEARCH_APP_SLUG]: { installed: true, enabled: true } }),
    }));
    const pow = createStorefrontClient({ tenant: 'mimarca', fetch });
    expect(await pow.catalog.searchEnabled()).toBe(true);
    expect(llamadas[0].url).toBe(
      'https://api.pow.la/api/v2/storefront/apps',
    );
    expect(await pow.config.appEnabled('resenas')).toBe(false);
  });

  it('nunca tira: un 500 o la red caída = apagado', async () => {
    const caido = createStorefrontClient({
      tenant: 'mimarca',
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(caido.catalog.searchEnabled()).resolves.toBe(false);
    const { fetch } = fetchFalso(() => ({ status: 500, body: { error: 'x' } }));
    const roto = createStorefrontClient({ tenant: 'mimarca', fetch });
    await expect(roto.catalog.searchEnabled()).resolves.toBe(false);
  });

  it('cache tags: searchEnabled = settings; searchConfig = search-config, search-featured, settings', () => {
    const pow = createStorefrontClient({ tenant: 'mimarca' });
    expect(pow.catalog.searchEnabled.cacheTags()).toEqual(['settings']);
    expect(pow.config.appEnabled.cacheTags('x')).toEqual(['settings']);
    expect(pow.catalog.searchConfig.cacheTags()).toEqual([
      'search-config',
      'search-featured',
      'settings',
    ]);
  });

  it('en Next, searchEnabled sale con el tag settings y TTL largo', async () => {
    const { fetch } = fetchFalso(() => ({ body: apps({}) }));
    const inits: RequestInit[] = [];
    const pow = clienteDeNext({
      tenant: 'mimarca',
      fetch: (u, i) => {
        inits.push(i!);
        return fetch(u, i);
      },
    });
    await pow.catalog.searchEnabled();
    expect((inits[0] as any).next).toEqual({ tags: ['settings'], revalidate: 3600 });
  });

  it('searchConfig y searchEvents', async () => {
    const { fetch, llamadas } = fetchFalso((l) => ({
      status: l.method === 'POST' ? 202 : 200,
      body:
        l.method === 'POST'
          ? { guardados: 1, descartados: 0 }
          : { min_chars: 2 },
    }));
    const pow = createStorefrontClient({ tenant: 'mimarca', publicToken: PST, fetch });
    expect(await pow.catalog.searchConfig()).toEqual({ min_chars: 2 });
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/search/config');
    const r = await pow.catalog.searchEvents(
      { events: [{ type: 'search', term: 'remera' }] },
      { headers: { 'X-Forwarded-For': '181.1.2.3' } },
    );
    expect(r).toEqual({ guardados: 1, descartados: 0 });
    expect(llamadas[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.pow.la/api/v2/search/events',
      body: { events: [{ type: 'search', term: 'remera' }] },
    });
    expect(llamadas[1].headers['x-forwarded-for']).toBe('181.1.2.3');
    expect(llamadas[1].headers['x-storefront-token']).toBe(PST);
  });
});

describe('createSearchEventsRoute', () => {
  const pedido = (cuerpo: unknown, headers: Record<string, string> = {}) =>
    new Request('https://tienda.agencia.com/api/hermes/search-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    });

  it('reenvía el lote con la IP real del comprador y contesta 202', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      status: 202,
      body: { guardados: 2, descartados: 0 },
    }));
    const POST = createSearchEventsRoute({
      client: createStorefrontClient({ tenant: 'mimarca', fetch }),
    });
    const r = await POST(
      pedido(
        { events: [{ type: 'search' }, { type: 'detail-page-view' }, { type: 'x' }] },
        { 'cf-connecting-ip': '181.1.2.3' },
      ),
    );
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ guardados: 2, descartados: 0 });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/search/events');
    expect(llamadas[0].headers['x-forwarded-for']).toBe('181.1.2.3');
    expect(llamadas[0].body).toEqual({
      events: [{ type: 'search' }, { type: 'detail-page-view' }],
    });
  });

  it('nunca devuelve error: API caída, 429, JSON roto o lote vacío → 202 con guardados 0', async () => {
    const caida = createSearchEventsRoute({
      client: createStorefrontClient({
        tenant: 'mimarca',
        fetch: async () => {
          throw new Error('timeout');
        },
      }),
    });
    for (const r of [
      await caida(pedido({ type: 'search' })),
      await caida(pedido('{roto')),
      await caida(pedido({ events: [] })),
    ]) {
      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ guardados: 0, descartados: 0 });
    }
    const { fetch, llamadas } = fetchFalso(() => ({ status: 429, body: {} }));
    const limitada = createSearchEventsRoute({
      client: createStorefrontClient({ tenant: 'mimarca', fetch }),
    });
    const r = await limitada(pedido({ type: 'search' }));
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ guardados: 0, descartados: 0 });
    expect(llamadas).toHaveLength(1);
  });

  it('un cuerpo más grande que el tope no viaja', async () => {
    const { fetch, llamadas } = fetchFalso();
    const POST = createSearchEventsRoute({
      client: createStorefrontClient({ tenant: 'mimarca', fetch }),
      maxBodyBytes: 100,
    });
    const r = await POST(pedido({ type: 'search', term: 'x'.repeat(200) }));
    expect(r.status).toBe(202);
    expect(llamadas).toHaveLength(0);
  });

  it('también sale por @hermesecommerce/storefront/next', () => {
    expect(rutaDesdeNext).toBe(createSearchEventsRoute);
  });
});

// ---------------------------------------------------------------------------
// Navegador (window, storage y sendBeacon de mentira)
// ---------------------------------------------------------------------------

class StorageFalso {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('navegador', () => {
  let beacons: { url: string; body: any }[];
  let beaconOk: boolean;

  beforeEach(() => {
    beacons = [];
    beaconOk = true;
    vi.stubGlobal('window', {});
    vi.stubGlobal('innerWidth', 375);
    vi.stubGlobal('localStorage', new StorageFalso());
    vi.stubGlobal('sessionStorage', new StorageFalso());
    vi.stubGlobal('navigator', {
      sendBeacon: (url: string, blob: Blob) => {
        // El Blob se lee async: lo guardamos y lo resolvemos en el test.
        beacons.push({ url, body: blob });
        return beaconOk;
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cuerpos = async () =>
    Promise.all(
      beacons.map(async (b) => ({
        url: b.url,
        body: JSON.parse(await (b.body as Blob).text()),
      })),
    );

  it('sendSearchEvents usa sendBeacon y completa visitante, sesión y dispositivo', async () => {
    sendSearchEvents([{ type: 'search', term: 'remera' }]);
    sendSearchEvents([{ type: 'search', term: 'buzo' }], { endpoint: '/otra' });
    const [a, b] = await cuerpos();
    expect(a.url).toBe('/api/hermes/search-events');
    expect(b.url).toBe('/otra');
    const e = a.body.events[0];
    expect(e).toMatchObject({ type: 'search', term: 'remera', device: 'mobile' });
    expect(typeof e.visitor_id).toBe('string');
    expect(typeof e.session_id).toBe('string');
    // el mismo visitante en los dos
    expect(b.body.events[0].visitor_id).toBe(e.visitor_id);
  });

  it('sin sendBeacon (o si lo rechaza), fetch con keepalive', async () => {
    beaconOk = false;
    const fetch = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    sendSearchEvents([{ type: 'search' }]);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/hermes/search-events');
    expect(init.keepalive).toBe(true);
  });

  it('nunca tira, aunque el storage y el fetch revienten', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    });
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', () => {
      throw new Error('sin red');
    });
    expect(() => sendSearchEvents([{ type: 'search' }])).not.toThrow();
    expect(() =>
      trackSearchClick({ key: 'remera', pg_id: 1, attribution_token: 't' }),
    ).not.toThrow();
    expect(trackSearchAddToCart({ key: 'remera' })).toBe(false);
    expect(trackSearchPurchase({ order_id: 1 })).toBe(0);
  });

  it('fuera del navegador no hace nada', () => {
    vi.unstubAllGlobals();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    sendSearchEvents([{ type: 'search' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('búsqueda → clic → carrito → compra, con el attribution_token de la búsqueda', async () => {
    trackSearch({
      term: 'remera',
      origin: 'page',
      results_count: 2,
      attribution_token: 'tok',
      shown_products: [
        { pg_id: 10, position: 1 },
        { pg_id: 11, position: 2 },
      ],
    });
    trackSearchClick({
      key: 'remera-negra',
      pg_id: 11,
      position: 2,
      attribution_token: 'tok',
      origin: 'page',
      term: 'remera',
    });
    expect(getSearchAttribution('remera-negra')).toMatchObject({
      pg_id: 11,
      attribution_token: 'tok',
    });
    // Un producto que no vino de una búsqueda no se mide.
    expect(trackSearchAddToCart({ key: 'otro', variant_id: 5 })).toBe(false);
    expect(
      trackSearchAddToCart({
        key: 'remera-negra',
        variant_id: 77,
        quantity: 2,
        revenue_cents: 2_000_000,
      }),
    ).toBe(true);
    expect(trackSearchPurchase({ order_id: 900 })).toBe(1);
    // recargar la página de gracias no duplica
    expect(trackSearchPurchase({ order_id: 900 })).toBe(0);

    const eventos = (await cuerpos()).flatMap((c) => c.body.events);
    expect(eventos.map((e: any) => e.type)).toEqual([
      'search',
      'detail-page-view',
      'add-to-cart',
      'purchase-complete',
    ]);
    expect(eventos[0]).toMatchObject({
      term: 'remera',
      origin: 'page',
      results_count: 2,
      shown_products: [
        { pg_id: 10, position: 1 },
        { pg_id: 11, position: 2 },
      ],
    });
    expect(eventos[1]).toMatchObject({ pg_id: 11, position: 2, attribution_token: 'tok' });
    expect(eventos[2]).toMatchObject({
      pg_id: 11,
      variant_id: 77,
      quantity: 2,
      attribution_token: 'tok',
    });
    expect(eventos[3]).toMatchObject({
      pg_id: 11,
      variant_id: 77,
      quantity: 2,
      revenue_cents: 2_000_000,
      order_id: 900,
      attribution_token: 'tok',
    });
  });

  it('la atribución vence a los 30 días', () => {
    const ahora = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(ahora);
    trackSearchClick({ key: 'x', pg_id: 1, attribution_token: 't' });
    spy.mockReturnValue(ahora + 31 * 24 * 60 * 60 * 1000);
    expect(getSearchAttribution('x')).toBeNull();
    spy.mockRestore();
  });
});

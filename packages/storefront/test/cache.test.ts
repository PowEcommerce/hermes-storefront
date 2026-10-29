import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_OPERATIONS,
  CACHE_TTL_SECONDS,
  cacheInfoFor,
  cacheTagsFor,
  createStorefrontClient as crearBase,
  handleRevalidateWebhook,
  type FetchLike,
} from '../src';
import {
  createRevalidateRoute,
  createStorefrontClient,
  nextCacheAdapter,
} from '../src/next';
import { revalidateTag } from './stubs/next-cache';
import { PST } from './helpers';

/** fetch que graba el RequestInit completo (para ver `next` y `cache`). */
function fetchQueGraba() {
  const inits: Array<{ url: string; init: Record<string, any> }> = [];
  const fetch: FetchLike = async (url, init) => {
    inits.push({ url, init: (init ?? {}) as Record<string, any> });
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, inits };
}

const SECRET = 'whsec_' + 'd'.repeat(64);
const firmar = (raw: string, secret = SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
const evento = (tags: unknown, ts = new Date().toISOString()) =>
  JSON.stringify({
    event: 'storefront/revalidate',
    id: 'rv_1',
    timestamp: ts,
    tags,
  });

describe('tags de caché (x-cache-tags)', () => {
  it('cacheTagsFor rellena las plantillas con los parámetros', () => {
    expect(cacheTagsFor('Pdp_show', { id: 'remera-lisa' })).toEqual([
      'product',
      'product-remera-lisa',
    ]);
    expect(cacheTagsFor('Products_category', { slug: 'sale' })).toEqual([
      'products',
      'category-sale',
    ]);
    // Sin el parámetro, ese tag no va.
    expect(cacheTagsFor('Products_filters', {})).toEqual(['products']);
    expect(cacheTagsFor('Settings_footer')).toEqual(['footer']);
  });

  it('los métodos GET exponen .cacheTags con sus mismos argumentos', () => {
    const pow = crearBase({
      tenant: 'mimarca',
      publicToken: PST,
      fetch: fetchQueGraba().fetch,
    });
    expect(pow.catalog.product.cacheTags('remera')).toEqual([
      'product',
      'product-remera',
    ]);
    expect(pow.catalog.products.cacheTags({ category: 'sale' })).toEqual([
      'products',
      'category-sale',
    ]);
    expect(pow.catalog.products.cacheTags()).toEqual(['products']);
    expect(pow.catalog.filters.cacheTags({ category_name: 'jeans' })).toEqual([
      'products',
      'category-jeans',
    ]);
    expect(pow.catalog.categories.cacheTags()).toEqual([
      'header',
      'categories',
    ]);
    expect(pow.config.get.cacheTags()).toEqual(['settings']);
    expect(pow.reviews.list.cacheTags('remera')).toEqual(['product-remera']);
  });

  it('cacheInfoFor: sólo GET con caché declarada; ttl en segundos', () => {
    expect(
      cacheInfoFor('GET', '/api/v2/landings/{slug}', { slug: 'hot' }),
    ).toEqual({
      operationId: 'Landings_show',
      tags: ['landings', 'landing-hot'],
      ttl: 'long',
      revalidate: CACHE_TTL_SECONDS.long,
    });
    expect(cacheInfoFor('GET', '/api/v2/cart')).toBeNull();
    expect(cacheInfoFor('POST', '/api/v2/landings/{slug}')).toBeNull();
    expect(cacheInfoFor('GET', '/api/v2/stores/availability')?.revalidate).toBe(
      false,
    );
  });

  it('todo tag generado es fijo o tiene una plantilla {param}', () => {
    for (const op of Object.values(CACHE_OPERATIONS))
      for (const t of op.tags) expect(t).toMatch(/^[a-z-]+(\{[a-z_]+\})?$/);
  });
});

describe('@hermesecommerce/storefront/next: cliente', () => {
  it('cada GET cacheable sale con next: { tags, revalidate }', async () => {
    const { fetch, inits } = fetchQueGraba();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      fetch,
    });
    await pow.catalog.product('remera');
    await pow.catalog.products({ category: 'sale', page_number: 2 });
    await pow.config.get();
    expect(inits[0].init.next).toEqual({
      tags: ['product', 'product-remera'],
      revalidate: 60,
    });
    expect(inits[1].init.next).toEqual({
      tags: ['products', 'category-sale'],
      revalidate: 60,
    });
    expect(inits[2].init.next).toEqual({
      tags: ['settings'],
      revalidate: 3600,
    });
  });

  it('también por el cliente genérico (api.GET) y con query', async () => {
    const { fetch, inits } = fetchQueGraba();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      fetch,
    });
    await pow.api.GET('/api/v2/products/filters', {
      query: { category_name: 'jeans' },
    });
    expect(inits[0].init.next.tags).toEqual(['products', 'category-jeans']);
  });

  it('none → no-store; sin caché declarada (carrito) → nada; fetchOptions propias mandan', async () => {
    const { fetch, inits } = fetchQueGraba();
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      fetch,
    });
    await pow.api.GET('/api/v2/stores/availability', {
      query: { variant_id: 1 },
    });
    await pow.cart.get('crt_x');
    await pow.catalog.product(
      'remera',
      {},
      { fetchOptions: { cache: 'no-store' } },
    );
    expect(inits[0].init.cache).toBe('no-store');
    expect(inits[0].init.next).toBeUndefined();
    expect(inits[1].init.next).toBeUndefined();
    expect(inits[1].init.cache).toBeUndefined();
    expect(inits[2].init.cache).toBe('no-store');
    expect(inits[2].init.next).toBeUndefined();
  });

  it('TTL propio por perfil', () => {
    const a = nextCacheAdapter({ ttl: { short: 30, long: false } });
    const info = cacheInfoFor('GET', '/api/v2/settings/footer')!;
    expect(a(info)).toEqual({ next: { tags: ['footer'] } });
    expect(a(cacheInfoFor('GET', '/api/v2/products')!)).toEqual({
      next: { tags: ['products'], revalidate: 30 },
    });
  });

  it('el core sin adapter no agrega nada al fetch', async () => {
    const { fetch, inits } = fetchQueGraba();
    await crearBase({ tenant: 'mimarca', fetch }).catalog.product('x');
    expect(inits[0].init.next).toBeUndefined();
  });
});

describe('webhook storefront/revalidate', () => {
  beforeEach(() => revalidateTag.mockClear());

  it('handleRevalidateWebhook: firma OK → onTags con soft/hard', async () => {
    const raw = evento([
      { tag: 'product-remera', mode: 'soft' },
      { tag: 'category-vieja', mode: 'hard' },
    ]);
    const onTags = vi.fn();
    const r = await handleRevalidateWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      onTags,
    });
    expect(r).toEqual({
      status: 200,
      body: { ok: true, revalidated: 2, event: 'storefront/revalidate' },
    });
    expect(onTags.mock.calls[0][0]).toEqual([
      { tag: 'product-remera', mode: 'soft' },
      { tag: 'category-vieja', mode: 'hard' },
    ]);
  });

  it('firma inválida → 401 sin purgar; timestamp viejo → 400; onTags que tira → 500', async () => {
    const raw = evento([{ tag: 'x', mode: 'soft' }]);
    const onTags = vi.fn();
    const mala = await handleRevalidateWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw, 'whsec_otro'),
      secret: SECRET,
      onTags,
    });
    expect(mala.status).toBe(401);
    const vieja = evento([{ tag: 'x', mode: 'soft' }], '2020-01-01T00:00:00Z');
    expect(
      (
        await handleRevalidateWebhook({
          rawBody: vieja,
          signatureHeader: firmar(vieja),
          secret: SECRET,
          onTags,
        })
      ).status,
    ).toBe(400);
    expect(onTags).not.toHaveBeenCalled();
    const rota = await handleRevalidateWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      onTags: () => {
        throw new Error('cdn caído');
      },
    });
    expect(rota.status).toBe(500);
  });

  it('webhook/test → 200 sin purgar', async () => {
    const raw = JSON.stringify({
      event: 'webhook/test',
      id: 't',
      timestamp: new Date().toISOString(),
      test: true,
    });
    const onTags = vi.fn();
    const r = await handleRevalidateWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      onTags,
    });
    expect(r.status).toBe(200);
    expect(onTags).not.toHaveBeenCalled();
  });

  it('createRevalidateRoute: soft → revalidateTag(tag, "max"); hard → { expire: 0 }', async () => {
    const POST = createRevalidateRoute({ secret: SECRET });
    const raw = evento([
      { tag: 'product-remera', mode: 'soft' },
      { tag: 'landing-hot-sale', mode: 'hard' },
    ]);
    const res = await POST(
      new Request('https://agencia.test/api/hermes/revalidate', {
        method: 'POST',
        headers: { 'x-webhook-signature': firmar(raw) },
        body: raw,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, revalidated: 2 });
    expect(revalidateTag.mock.calls).toEqual([
      ['product-remera', 'max'],
      ['landing-hot-sale', { expire: 0 }],
    ]);
  });

  it('createRevalidateRoute: sin secreto → 500; firma mala → 401 sin purgar', async () => {
    const raw = evento([{ tag: 'x', mode: 'soft' }]);
    const req = (firma: string) =>
      new Request('https://a.test/x', {
        method: 'POST',
        headers: { 'x-webhook-signature': firma },
        body: raw,
      });
    expect(
      (await createRevalidateRoute({ secret: undefined })(req(firmar(raw))))
        .status,
    ).toBe(500);
    expect(
      (
        await createRevalidateRoute({ secret: SECRET })(
          req(firmar(raw, 'whsec_x')),
        )
      ).status,
    ).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

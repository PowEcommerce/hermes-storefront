import { describe, expect, it } from 'vitest';
import {
  blockSpan,
  collectPageSkus,
  createStorefrontClient,
  matchSkuRecords,
  normalizePageBlocks,
  parseSkuCsv,
  resolveHref,
  type PageSection,
  type SkuProduct,
} from '../src';
import { fetchFalso, PST } from './helpers';

const comunes = {
  name: null,
  position: 0,
  active: true,
  classes: null,
  content_text_position: 'content_text_center' as const,
};

const banner = (id: number, extra: Record<string, unknown> = {}) => ({
  ...comunes,
  id,
  type: 'PageBlock::Banner' as const,
  width: 100,
  bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-100p' },
  href: null,
  title: null,
  image: `https://cdn/x/${id}.jpg`,
  mobile_image: null,
  text_color: null,
  ...extra,
});

const ROUTES = {
  category: (s: string) => `/categoria/${s}`,
  product: (s: string) => `/producto/${s}`,
  landing: (s: string) => `/pages/${s}`,
};
const HOSTS = ['https://www.mimarca.com.ar', 'outlet.mimarca.com.ar'];

describe('resolveHref', () => {
  const r = (h: string | null | undefined) => resolveHref(h, { brandHosts: HOSTS, routes: ROUTES });

  it('vacío, espacios, # o esquemas peligrosos → null', () => {
    expect(r('')).toBeNull();
    expect(r('   ')).toBeNull();
    expect(r(null)).toBeNull();
    expect(r('#')).toBeNull();
    expect(r('javascript:alert(1)')).toBeNull();
    expect(r(' JavaScript:alert(1)')).toBeNull();
    expect(r('data:text/html,hola')).toBeNull();
  });

  it('host propio (con o sin www, con UTM) → ruta relativa mapeada', () => {
    expect(r('https://www.mimarca.com.ar/categorias/denim-22')).toEqual({ href: '/categoria/denim-22', external: false });
    expect(r('https://mimarca.com.ar/categorias/denim?utm_source=x#top')).toEqual({
      href: '/categoria/denim?utm_source=x#top',
      external: false,
    });
    expect(r('https://outlet.mimarca.com.ar/productos/remera-lisa/negro')).toEqual({
      href: '/producto/remera-lisa',
      external: false,
    });
    expect(r('https://www.mimarca.com.ar/')).toEqual({ href: '/', external: false });
  });

  it('sin esquema → https; si es propio, relativo', () => {
    expect(r('www.otra-tienda.com')).toEqual({ href: 'https://www.otra-tienda.com/', external: true });
    expect(r('www.mimarca.com.ar/pages/verano')).toEqual({ href: '/pages/verano', external: false });
    expect(r('//cdn.otro.com/a')).toEqual({ href: 'https://cdn.otro.com/a', external: true });
  });

  it('rutas del sitio viejo y relativas', () => {
    expect(r('/categorias/accesorios')).toEqual({ href: '/categoria/accesorios', external: false });
    expect(r('categorias/accesorios')).toEqual({ href: '/categoria/accesorios', external: false });
    expect(r('/home')).toEqual({ href: '/', external: false });
    expect(r('/pages/inside-the-archives')).toEqual({ href: '/pages/inside-the-archives', external: false });
    expect(r('/new-in-ss26')).toEqual({ href: '/new-in-ss26', external: false });
  });

  it('sin routes, las rutas quedan como vienen', () => {
    expect(resolveHref('/categorias/x')).toEqual({ href: '/categorias/x', external: false });
  });

  it('otro dominio y mailto quedan externos', () => {
    expect(r('https://instagram.com/mimarca')).toEqual({ href: 'https://instagram.com/mimarca', external: true });
    expect(r('mailto:hola@mimarca.com.ar')).toEqual({ href: 'mailto:hola@mimarca.com.ar', external: true });
  });
});

describe('parseSkuCsv', () => {
  it('separa por coma, saca espacios, vacíos y repetidos', () => {
    expect(parseSkuCsv(' V2704931%40S, V2701561%25XS ,, V2704931%40S,')).toEqual(['V2704931%40S', 'V2701561%25XS']);
    expect(parseSkuCsv('')).toEqual([]);
    expect(parseSkuCsv(null)).toEqual([]);
  });
});

describe('blockSpan', () => {
  it('lee bootstrap_class {xs, md}', () => {
    expect(blockSpan({ bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-50p' } })).toEqual({ xs: 12, md: 6 });
    expect(blockSpan({ bootstrap_class: { xs: 'col-xs-6', md: 'flex-width-33p' } })).toEqual({ xs: 6, md: 4 });
    expect(blockSpan({ bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-75p' } })).toEqual({ xs: 12, md: 9 });
  });
  it('sin clase usable, cae a width', () => {
    expect(blockSpan({ bootstrap_class: null, width: 25 })).toEqual({ xs: 12, md: 3 });
    expect(blockSpan({ width: 66 })).toEqual({ xs: 12, md: 8 });
    expect(blockSpan({})).toEqual({ xs: 12, md: 12 });
  });
});

describe('normalizePageBlocks', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const secciones = [
    { section_index: 0, classes: null, blocks: [null] },
    {
      section_index: 1,
      classes: null,
      blocks: [
        banner(1, { href: 'https://www.mimarca.com.ar/categorias/denim', width: 50, bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-50p' } }),
        null,
        { ...banner(2), type: 'PageBlock::RandomBannerButton', items: [] },
        banner(3, { active_till: '2026-10-01T00:00:00Z' }),
        banner(4, { active_from: '2026-11-01T00:00:00Z' }),
        banner(5, { width: 50, bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-50p' }, active_till: '2026-12-01' }),
      ],
    },
    {
      section_index: 2,
      classes: null,
      blocks: [
        {
          ...comunes,
          id: 10,
          type: 'PageBlock::Carousel',
          width: 100,
          bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-100p' },
          items: [
            { id: 11, href: 'www.mimarca.com.ar/categorias/summer', image: 'a', posimg: 0 },
            null,
          ],
        },
        {
          ...comunes,
          id: 12,
          type: 'PageBlock::Video',
          width: 100,
          bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-100p' },
          href: '',
          video_url_desktop: 'https://www.youtube.com/embed/abc?rel=0&amp;controls=0&amp;mute=1',
          video_url_mobile: '',
        },
      ],
    },
  ] as unknown as PageSection[];

  const res = normalizePageBlocks({ page_blocks: secciones }, { now, brandHosts: HOSTS, routes: ROUTES });

  it('descarta null, RandomBannerButton, vencidos y futuros; saca secciones vacías', () => {
    expect(res.sections.map((s) => s.index)).toEqual([1, 2]);
    expect(res.blocks.map((b) => b.id)).toEqual([1, 5, 10, 12]);
  });

  it('numera en orden y pone el ancho en columnas', () => {
    expect(res.blocks.map((b) => b.order)).toEqual([1, 2, 3, 4]);
    expect(res.blocks[0].span).toEqual({ xs: 12, md: 6 });
    expect(res.blocks[2].span).toEqual({ xs: 12, md: 12 });
    expect(res.blocks[0].section).toBe(1);
  });

  it('resuelve los href del bloque y de los items; "" → null', () => {
    expect((res.blocks[0] as { href: string }).href).toBe('/categoria/denim');
    const items = (res.blocks[2] as unknown as { items: { href: string }[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0].href).toBe('/categoria/summer');
    expect((res.blocks[3] as { href: string | null }).href).toBeNull();
  });

  it('decodifica &amp; en los embeds', () => {
    expect((res.blocks[3] as { video_url_desktop: string }).video_url_desktop).toBe(
      'https://www.youtube.com/embed/abc?rel=0&controls=0&mute=1',
    );
  });

  it('acepta el array de secciones, null o vacío', () => {
    expect(normalizePageBlocks(secciones, { now }).blocks).toHaveLength(4);
    expect(normalizePageBlocks(null)).toEqual({ sections: [], blocks: [] });
    expect(normalizePageBlocks({ page_blocks: [] })).toEqual({ sections: [], blocks: [] });
  });
});

describe('SKUs de la página', () => {
  const sku = (id: number, extra: Record<string, unknown>) =>
    ({
      ...comunes,
      id,
      type: 'PageBlock::SkuCarousel',
      width: 100,
      bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-100p' },
      title: null,
      image: null,
      mobile_image: null,
      href: null,
      sku_carousel: '',
      tabs: [],
      ...extra,
    }) as never;

  it('collectPageSkus junta todos los SKUs (CSV + solapas) sin repetir', () => {
    const blocks = [
      banner(1) as never,
      sku(2, { sku_carousel: 'A%S, B%M' }),
      sku(3, { sku_carousel: 'B%M, C', tabs: [{ id: 1, label: 'X', sku_list: 'D, A%S', posimg: 0 }] }),
    ];
    expect(collectPageSkus(blocks)).toEqual(['A%S', 'B%M', 'C', 'D']);
    expect(collectPageSkus([{ blocks }])).toEqual(['A%S', 'B%M', 'C', 'D']);
  });

  it('matchSkuRecords reparte por sku / grouped_skus, en orden y sin repetir el color', () => {
    const rec = (pg: number, v: number, skus: string[]) =>
      ({ pg_id: pg, variant_id: v, slug: `p${pg}`, variant: { sku: skus[0], grouped_skus: skus } }) as SkuProduct;
    const records = [rec(1, 10, ['A%S', 'A%M']), rec(2, 20, ['B%M']), rec(3, 30, ['C'])];
    expect(matchSkuRecords(records, ['C', 'A%M', 'X', 'A%S', 'B%M']).map((r) => r.pg_id)).toEqual([3, 1, 2]);
    expect(matchSkuRecords(records, ['Z'])).toEqual([]);
  });
});

describe('client.content', () => {
  it('home con pb_type, landing null en 404, tags', async () => {
    const { fetch, llamadas } = fetchFalso((l) =>
      l.url.includes('/landings/nada')
        ? { status: 404, body: { error: 'Not found' } }
        : { body: { page_blocks: [], settings: {} } },
    );
    const pow = createStorefrontClient({ tenant: 'mimarca', publicToken: PST, fetch });
    await pow.content.home({ pbType: 'OUTLET' });
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/home/page_blocks?pb_type=OUTLET');
    await pow.content.home();
    expect(llamadas[1].url).toBe('https://api.pow.la/api/v2/home/page_blocks');
    expect(await pow.content.landing('nada')).toBeNull();
    expect(llamadas[2].url).toBe('https://api.pow.la/api/v2/landings/nada');
    expect(pow.content.home.cacheTags()).toEqual(['home-page-blocks']);
    expect(pow.content.landing.cacheTags('verano')).toEqual(['landings', 'landing-verano']);
    expect(pow.content.staticContent.cacheTags('faq')).toEqual(['static-contents', 'static-content-faq']);
  });

  it('home con homeVersionToken: manda el token y no cachea (no-store)', async () => {
    const inits: Array<{ url: string; init?: RequestInit }> = [];
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      fetch: async (url, init) => {
        inits.push({ url, init });
        return new Response(JSON.stringify({ page_blocks: [], settings: {} }), {
          headers: { 'content-type': 'application/json' },
        });
      },
      cache: () => ({ next: { tags: ['home-page-blocks'], revalidate: 60 } }),
    });
    await pow.content.home({ pbType: 'OUTLET', homeVersionToken: 'tok' });
    expect(inits[0].url).toBe(
      'https://api.pow.la/api/v2/home/page_blocks?pb_type=OUTLET&home_version_token=tok',
    );
    expect((inits[0].init as any).cache).toBe('no-store');
    expect((inits[0].init as any).next).toBeUndefined();
    await pow.content.home();
    expect((inits[1].init as any).cache).toBeUndefined();
  });

  it('landing con 500 tira (no se cachea un 404 falso)', async () => {
    const { fetch } = fetchFalso(() => ({ status: 500, body: { error: 'boom' } }));
    const pow = createStorefrontClient({ tenant: 'mimarca', fetch });
    await expect(pow.content.landing('x')).rejects.toMatchObject({ status: 500 });
  });

  it('el adapter de caché recibe los tags de la landing', async () => {
    const vistos: string[][] = [];
    const { fetch } = fetchFalso(() => ({ body: { slug: 'v', page_blocks: [] } }));
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      fetch,
      cache: (info) => {
        vistos.push(info.tags);
        return undefined;
      },
    });
    await pow.content.landing('verano');
    await pow.content.home();
    expect(vistos).toEqual([['landings', 'landing-verano'], ['home-page-blocks']]);
  });
});

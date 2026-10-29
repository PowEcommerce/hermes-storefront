import { describe, expect, it } from 'vitest';
import { collectPageSkus, normalizePageBlocks, parseSkuCsv, type PageSection, type SkuProduct } from '@hermesecommerce/storefront';
import { sanitizarHtml } from '../lib/sanitize';
import { brandHosts, ROUTES } from '../lib/links';
import { cardsFor } from '../lib/catalog';

const LINKS = { brandHosts: ['https://www.mimarca.com.ar'], routes: ROUTES };

describe('sanitizarHtml (RichText del backoffice)', () => {
  it('saca script, on*, style, class y javascript:', () => {
    const html = sanitizarHtml(
      '<h2 class="x" style="color:red" onclick="alert(1)">Hola</h2><script>alert(1)</script>' +
        '<a href="javascript:alert(1)">mal</a><a href="java&#x73;cript:alert(1)">mal2</a><img src="x" onerror="alert(1)">',
      LINKS,
    );
    expect(html).toBe('<h2>Hola</h2><a>mal</a><a>mal2</a><img src="x" loading="lazy" decoding="async" />');
  });

  it('resuelve los links propios y marca los externos', () => {
    const html = sanitizarHtml(
      '<p><a href="https://www.mimarca.com.ar/categorias/denim">propio</a> <a href="www.instagram.com/mimarca">ig</a></p>',
      LINKS,
    );
    expect(html).toBe(
      '<p><a href="/categoria/denim">propio</a> <a href="https://www.instagram.com/mimarca" target="_blank" rel="noopener noreferrer">ig</a></p>',
    );
  });

  it('target=_blank siempre con rel=noopener', () => {
    expect(sanitizarHtml('<a href="/x" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="/x" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('imágenes https lazy; iframes sólo de YouTube/Vimeo', () => {
    expect(sanitizarHtml('<img src="https://cdn/x.jpg" alt="a">')).toBe(
      '<img src="https://cdn/x.jpg" alt="a" loading="lazy" decoding="async" />',
    );
    expect(sanitizarHtml('<iframe src="https://evil.com/x"></iframe>')).toBe('<iframe loading="lazy"></iframe>');
    expect(sanitizarHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>')).toContain(
      'src="https://www.youtube.com/embed/abc"',
    );
  });

  it('vacío → ""', () => {
    expect(sanitizarHtml(null)).toBe('');
    expect(sanitizarHtml('   ')).toBe('');
  });
});

describe('brandHosts', () => {
  it('HERMES_BRAND_HOSTS + SITE_URL', () => {
    expect(brandHosts({ HERMES_BRAND_HOSTS: 'www.mimarca.com.ar, mimarca.com.ar', SITE_URL: 'https://tienda.com' })).toEqual([
      'www.mimarca.com.ar',
      'mimarca.com.ar',
      'https://tienda.com',
    ]);
    expect(brandHosts({})).toEqual([]);
  });
});

describe('reparto de SKUs entre bloques (un solo items?skus= por página)', () => {
  const sku = (id: number, csv: string, tabs: string[] = []) => ({
    id,
    type: 'PageBlock::SkuCarousel',
    name: null,
    position: id,
    width: 50,
    active: true,
    classes: null,
    bootstrap_class: { xs: 'col-xs-12', md: 'flex-width-50p' },
    content_text_position: 'content_text_center',
    sku_carousel: csv,
    title: null,
    image: null,
    mobile_image: null,
    href: '',
    tabs: tabs.map((t, i) => ({ id: i, label: `T${i}`, sku_list: t, posimg: i })),
  });
  const page = normalizePageBlocks(
    [
      { section_index: 0, classes: null, blocks: [sku(1, 'REM-S, REM-M, TAZA-U'), sku(2, 'TAZA-U, GORRA-U', ['BUZO-L'])] },
    ] as unknown as PageSection[],
  );
  const rec = (pg: number, slug: string, skus: string[], precio: number): SkuProduct => ({
    pg_id: pg,
    variant_id: pg * 10,
    slug,
    title: slug.toUpperCase(),
    image_url: `https://cdn/${slug}.jpg`,
    variant: { sku: skus[0], grouped_skus: skus, non_formatted_price: precio, has_special_price: false },
  });
  const records = [rec(1, 'remera', ['REM-S', 'REM-M'], 31999), rec(2, 'taza', ['TAZA-U'], 9000), rec(3, 'buzo', ['BUZO-L'], 50000)];

  it('junta todos los SKUs de la página una sola vez', () => {
    expect(collectPageSkus(page.blocks)).toEqual(['REM-S', 'REM-M', 'TAZA-U', 'GORRA-U', 'BUZO-L']);
  });

  it('cada bloque se queda con los suyos, en orden, sin repetir el color', () => {
    const b1 = cardsFor(records, parseSkuCsv('REM-S, REM-M, TAZA-U'));
    expect(b1.map((c) => c.slug)).toEqual(['remera', 'taza']);
    expect(b1[0].price?.replace(/\s/g, ' ')).toBe('$ 31.999');
    expect(cardsFor(records, parseSkuCsv('TAZA-U, GORRA-U')).map((c) => c.slug)).toEqual(['taza']);
    expect(cardsFor(records, ['BUZO-L']).map((c) => c.slug)).toEqual(['buzo']);
    expect(cardsFor([], ['REM-S'])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { SearchSuggestions } from '@hermesecommerce/storefront';
import { hrefDeCategoria, panelVacio, partesResaltadas, sugerenciasDelPanel } from '@/lib/buscador';

describe('buscador inteligente: lógica del panel', () => {
  it('las categorías de la API van a /categoria/<slug> de la tienda', () => {
    expect(hrefDeCategoria({ slug: 'remeras' })).toBe('/categoria/remeras');
    expect(hrefDeCategoria({ url: '/categorias/remeras-musculosas' })).toBe('/categoria/remeras-musculosas');
    expect(hrefDeCategoria({ url: '/categoria/jeans?x=1' })).toBe('/categoria/jeans');
    expect(hrefDeCategoria({ url: '/sale' })).toBe('/sale');
    expect(hrefDeCategoria({ url: 'https://otro.test/x' })).toBeNull();
    expect(hrefDeCategoria({})).toBeNull();
  });

  it('resalta lo tipeado con el highlight [desde, hasta)', () => {
    expect(partesResaltadas('remera', [0, 3])).toEqual([
      { texto: 'rem', marcado: true },
      { texto: 'era', marcado: false },
    ]);
    expect(partesResaltadas('buzo remera', [5, 8])).toEqual([
      { texto: 'buzo ', marcado: false },
      { texto: 'rem', marcado: true },
      { texto: 'era', marcado: false },
    ]);
    // sin highlight o fuera de rango: sin resaltar (mejor nada que mal)
    expect(partesResaltadas('remera', null)).toEqual([{ texto: 'remera', marcado: false }]);
    expect(partesResaltadas('remera', [3, 99])).toEqual([{ texto: 'remera', marcado: false }]);
  });

  it('el panel vacío: lo más buscado y destacadas, con min_chars por defecto', () => {
    expect(panelVacio(null)).toEqual({ minCaracteres: 2, masBuscado: [], destacadas: { titulo: null, items: [] } });
    expect(
      panelVacio({
        min_chars: 3,
        most_searched: { source: 'real', items: [{ term: 'malla' }, { term: '' }] },
        featured_categories: { title: 'Destacadas', items: [{ id: 1, name: 'Denim', slug: 'denim', url: '/categorias/denim' }] },
        recommended: {},
      }),
    ).toEqual({
      minCaracteres: 3,
      masBuscado: ['malla'],
      destacadas: { titulo: 'Destacadas', items: [{ nombre: 'Denim', href: '/categoria/denim' }] },
    });
  });

  it('las sugerencias: hasta 5 productos con pg_id y posición, y el redirect', () => {
    const producto = (n: number) => ({ pg_id: n, slug: `p-${n}`, title: `Producto ${n}`, variant: { non_formatted_price: 1000 } });
    const r = sugerenciasDelPanel({
      terms: [{ term: 'remera', type: 'term', highlight: [0, 3] }],
      categories: [{ term: 'remeras', type: 'category', url: '/categorias/remeras' }],
      brands: [],
      attrs: [],
      products: [1, 2, 3, 4, 5, 6].map(producto),
      total: 40,
      corrected_query: null,
      redirect: '/pages/gift-card',
      attribution_token: 'tok',
      explain: null,
    } as unknown as SearchSuggestions);
    expect(r.terms).toEqual([{ term: 'remera', highlight: [0, 3] }]);
    expect(r.categories).toEqual([{ term: 'remeras', href: '/categoria/remeras', highlight: null }]);
    expect(r.products).toHaveLength(5);
    expect(r.products[0]).toMatchObject({ pg_id: 1, position: 1, slug: 'p-1', title: 'Producto 1' });
    expect(r.redirect).toBe('/pages/gift-card');
    expect(r.attribution_token).toBe('tok');
  });
});

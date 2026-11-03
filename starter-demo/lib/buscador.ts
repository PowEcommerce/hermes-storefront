// Buscador inteligente (app `buscador-inteligente` del App Store de Hermes).
//
// Con la app prendida, el header muestra el panel con autocompletar y /buscar
// usa el buscador nuevo (`catalog.search`) y mide búsquedas, clics, carrito y
// compras. Con la app apagada o sin instalar, /buscar busca con el listado
// (`catalog.products({ q })`) y el header queda con el campo de siempre.
//
// Sin imports de server ni de client: lo usan la ruta de sugerencias, los
// componentes y los tests.
import type { SearchConfig, SearchSuggestions } from '@hermesecommerce/storefront';
import { cardFromBuscador, type ProductCardData } from './catalog';

/** Desde cuántas letras se piden sugerencias si el panel no lo dice. */
export const MIN_CARACTERES = 2;

/** Ruta de la tienda que devuelve las sugerencias (app/api/buscador/sugerencias). */
export const RUTA_SUGERENCIAS = '/api/buscador/sugerencias';

/**
 * El link de una categoría del buscador. La API manda la URL del sitio de la
 * marca (`/categorias/remeras`); en esta tienda las categorías viven en
 * `/categoria/<slug>`.
 */
export function hrefDeCategoria(c: { url?: string | null; slug?: string | null }): string | null {
  if (c.slug) return `/categoria/${encodeURIComponent(c.slug)}`;
  const url = c.url ?? '';
  const m = url.match(/^\/categorias?\/([^/?#]+)/);
  if (m) return `/categoria/${m[1]}`;
  return url.startsWith('/') ? url : null;
}

/** Un término partido en lo tipeado (resaltado) y el resto. */
export function partesResaltadas(
  termino: string,
  highlight?: number[] | null,
): { texto: string; marcado: boolean }[] {
  const [desde, hasta] = highlight ?? [];
  if (typeof desde !== 'number' || typeof hasta !== 'number' || desde < 0 || hasta <= desde || hasta > termino.length)
    return [{ texto: termino, marcado: false }];
  return [
    { texto: termino.slice(0, desde), marcado: false },
    { texto: termino.slice(desde, hasta), marcado: true },
    { texto: termino.slice(hasta), marcado: false },
  ].filter((p) => p.texto);
}

/** Producto del panel: la tarjeta + lo que hace falta para medir el clic. */
export type ProductoDelPanel = ProductCardData & { pg_id: number | null; position: number };

/** Lo que la ruta de sugerencias le devuelve al panel (lo justo, sin el record entero). */
export interface SugerenciasDelPanel {
  terms: { term: string; highlight: number[] | null }[];
  categories: { term: string; href: string; highlight: number[] | null }[];
  products: ProductoDelPanel[];
  total: number;
  corrected_query: string | null;
  redirect: string | null;
  attribution_token: string | null;
}

/** Hasta cuántos productos muestra el panel mientras se tipea. */
export const PRODUCTOS_EN_EL_PANEL = 5;

export function sugerenciasDelPanel(r: SearchSuggestions): SugerenciasDelPanel {
  return {
    terms: (r.terms ?? []).map((t) => ({ term: t.term, highlight: t.highlight ?? null })),
    categories: (r.categories ?? []).flatMap((c) => {
      const href = hrefDeCategoria({ url: c.url });
      return href ? [{ term: c.term, href, highlight: c.highlight ?? null }] : [];
    }),
    products: (r.products ?? [])
      .slice(0, PRODUCTOS_EN_EL_PANEL)
      .flatMap((p, i) => {
        const card = cardFromBuscador(p);
        return card ? [{ ...card, pg_id: typeof p.pg_id === 'number' ? p.pg_id : null, position: i + 1 }] : [];
      }),
    total: r.total ?? 0,
    corrected_query: r.corrected_query ?? null,
    redirect: r.redirect ?? null,
    attribution_token: r.attribution_token ?? null,
  };
}

/** El panel vacío (antes de tipear): lo más buscado y las categorías destacadas. */
export interface PanelVacio {
  minCaracteres: number;
  masBuscado: string[];
  destacadas: { titulo: string | null; items: { nombre: string; href: string }[] };
}

export function panelVacio(c: SearchConfig | null): PanelVacio {
  return {
    minCaracteres: c?.min_chars && c.min_chars > 0 ? c.min_chars : MIN_CARACTERES,
    masBuscado: (c?.most_searched?.items ?? []).map((i) => i.term).filter(Boolean).slice(0, 10),
    destacadas: {
      titulo: c?.featured_categories?.title ?? null,
      items: (c?.featured_categories?.items ?? []).flatMap((i) => {
        const href = hrefDeCategoria(i);
        return href && i.name ? [{ nombre: i.name, href }] : [];
      }),
    },
  };
}

/** `/buscar?q=…` */
export const hrefDeBusqueda = (q: string) => `/buscar?q=${encodeURIComponent(q)}`;

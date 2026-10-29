import { matchSkuRecords, type CatalogQuery, type ProductFilters, type SkuProduct } from '@hermesecommerce/storefront';
import { formatearPrecio, precioDe, type ConPrecio } from './precios';

/** Lo que necesita una tarjeta de producto, venga del listado o del buscador. */
export interface ProductCardData {
  key: string;
  slug: string;
  title: string;
  image: string | null;
  imageHover: string | null;
  price: string | null;
  compareAt: string | null;
  /** Colores del producto (hexa) para los puntitos de la tarjeta. */
  colors: { hex: string; name: string }[];
}

type Listado = {
  id: number;
  slug: string;
  title: string;
  image_url?: string | null;
  image_sec_url?: string | null;
  variant: ConPrecio & { id: number | null };
  grouped_colors_ids?: unknown;
};

type DelBuscador = {
  pg_id?: number;
  variant_id?: number;
  slug?: string;
  title?: string;
  image_url?: string | null;
  image_sec_url?: string | null;
  grouped_colors_ids?: unknown;
  variant?: unknown;
};

/** `"#hexa,actable_id,variant_id,nombre"` → { hex, name } */
function colores(v: unknown): ProductCardData['colors'] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => {
      const [hex, , , ...nombre] = x.split(',');
      return { hex, name: nombre.join(',') };
    })
    .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c.hex));
}

/** Precio y tachado de la tarjeta, formateados desde los números de la API. */
function preciosDeTarjeta(v: ConPrecio | null | undefined): Pick<ProductCardData, 'price' | 'compareAt'> {
  const p = precioDe(v);
  if (!p) return { price: null, compareAt: null };
  return {
    price: formatearPrecio(p.actual),
    compareAt: p.lista !== null && p.lista > p.actual ? formatearPrecio(p.lista) : null,
  };
}

export function cardFromListado(p: Listado): ProductCardData {
  return {
    key: `${p.id}-${p.variant.id ?? ''}`,
    slug: p.slug,
    title: p.title,
    image: p.image_url ?? null,
    imageHover: p.image_sec_url ?? null,
    ...preciosDeTarjeta(p.variant),
    colors: colores(p.grouped_colors_ids),
  };
}

export function cardFromBuscador(r: DelBuscador): ProductCardData | null {
  if (!r.slug || !r.title) return null;
  // El buscador manda `formatted_price` / `non_formatted_price` y no trae
  // `has_special_price`: hay oferta si el especial es > 0 y menor al de lista.
  const v = (r.variant ?? {}) as {
    formatted_price?: string;
    formatted_special_price?: string;
    non_formatted_price?: number;
    non_formatted_special_price?: number;
  };
  const precios = preciosDeTarjeta({
    price: v.formatted_price,
    special_price: v.formatted_special_price,
    non_formatted_price: v.non_formatted_price,
    non_formatted_special_price: v.non_formatted_special_price,
    has_special_price: true,
  });
  return {
    key: `${r.pg_id ?? r.slug}-${r.variant_id ?? ''}`,
    slug: r.slug,
    title: r.title,
    image: r.image_url ?? null,
    imageHover: r.image_sec_url ?? null,
    ...precios,
    colors: colores(r.grouped_colors_ids),
  };
}

// ---------------------------------------------------------------------------
// Filtros de la PLP: las facetas de `catalog.filters` → query de la URL → API
// ---------------------------------------------------------------------------

export interface Faceta {
  /** Clave de la faceta tal cual viene (`color`, `Talle`, `Material`…): también es el parámetro de la URL. */
  key: string;
  label: string;
  options: { value: string; total: number; hex: string | null }[];
}

const NO_FACETAS = new Set(['tags', 'Categorias']);

export function facetasDe(f: ProductFilters | null): Faceta[] {
  if (!f) return [];
  const out: Faceta[] = [];
  for (const [key, raw] of Object.entries(f)) {
    if (NO_FACETAS.has(key) || !Array.isArray(raw) || raw.length === 0) continue;
    const opciones = (raw as { display_name?: string | null; total?: number; specific?: { description?: string; hexa?: string | null } }[])
      .map((o) => ({
        value: o.specific?.description ?? '',
        total: typeof o.total === 'number' ? o.total : 0,
        hex: o.specific?.hexa ?? null,
      }))
      .filter((o) => o.value);
    if (!opciones.length) continue;
    const primero = raw[0] as { display_name?: string | null };
    out.push({ key, label: primero.display_name || key, options: opciones });
  }
  return out;
}

export const ORDENES = {
  destacados: { label: 'Destacados', query: {} },
  menor_precio: { label: 'Menor precio', query: { price: '1' } },
  mayor_precio: { label: 'Mayor precio', query: { price: '-1' } },
  nuevos: { label: 'Más nuevos', query: { new: '-1' } },
  mas_vistos: { label: 'Más vistos', query: { views: '-1' } },
} as const satisfies Record<string, { label: string; query: CatalogQuery }>;

export type Orden = keyof typeof ORDENES;

type SearchParams = Record<string, string | string[] | undefined>;

export const RESERVADOS = new Set(['page', 'orden', 'q']);

/** Los valores elegidos de una faceta en la URL (`?color=NEGRO&color=BLANCO` o `?color=NEGRO,BLANCO`). */
export function elegidos(sp: SearchParams, key: string): string[] {
  const v = sp[key];
  const lista = Array.isArray(v) ? v : v ? [v] : [];
  return lista.flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);
}

/** Query de la API a partir de la URL de la PLP. */
export function queryDeLaUrl(sp: SearchParams, facetas: string[]): CatalogQuery {
  const q: CatalogQuery = {};
  const page = Number(sp.page);
  q.page_number = Number.isInteger(page) && page > 0 ? page : 1;
  const orden = typeof sp.orden === 'string' && sp.orden in ORDENES ? (sp.orden as Orden) : 'destacados';
  Object.assign(q, ORDENES[orden].query);
  for (const key of facetas) {
    const valores = elegidos(sp, key);
    if (!valores.length) continue;
    const k = key.toLowerCase();
    if (k === 'color') q.multicolors = valores;
    else if (k === 'talle') q.multisizes = valores;
    else q[key] = valores.join(',');
  }
  return q;
}

/** Cantidad de páginas de un listado. */
export const paginas = (total: number, porPagina: number) =>
  Math.max(1, Math.ceil(total / Math.max(1, porPagina)));

/** Tarjeta de un record de `catalog.bySkus` (carrusel de SKUs de los page blocks). */
export function cardFromSku(r: {
  pg_id?: number;
  variant_id?: number;
  slug?: string | null;
  title?: string | null;
  image_url?: string | null;
  image_sec_url?: string | null;
  grouped_colors_ids?: unknown;
  variant?: {
    formatted_price?: string;
    formatted_special_price?: string;
    non_formatted_price?: number;
    non_formatted_special_price?: number;
    has_special_price?: boolean;
  } | null;
}): ProductCardData | null {
  if (!r.slug || !r.title) return null;
  const v = r.variant ?? {};
  return {
    key: `${r.pg_id ?? r.slug}-${r.variant_id ?? ''}`,
    slug: r.slug,
    title: r.title,
    image: r.image_url ?? null,
    imageHover: r.image_sec_url ?? null,
    ...preciosDeTarjeta({
      price: v.formatted_price,
      special_price: v.formatted_special_price,
      non_formatted_price: v.non_formatted_price,
      non_formatted_special_price: v.non_formatted_special_price,
      has_special_price: v.has_special_price ?? false,
    }),
    colors: colores(r.grouped_colors_ids),
  };
}

/**
 * Las tarjetas de una lista de SKUs (un SkuCarousel o una de sus solapas),
 * sacadas de los records del pedido ÚNICO de la página: orden del CSV, sin
 * repetir producto+color, sin los que no volvieron (sin stock, despublicados).
 */
export function cardsFor(records: readonly SkuProduct[], skus: readonly string[]): ProductCardData[] {
  return matchSkuRecords(records, skus)
    .map(cardFromSku)
    .filter((c): c is ProductCardData => c !== null);
}

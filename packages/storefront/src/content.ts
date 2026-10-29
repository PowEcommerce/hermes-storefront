/**
 * Contenido de la marca (page blocks de la home y de las landings): helpers
 * PUROS, sin red ni dependencias, que se usan igual en el servidor, en el
 * navegador y en los tests.
 *
 *  - `normalizePageBlocks`: de la respuesta cruda de `content.home()` /
 *    `content.landing()` a una lista lista para dibujar (sin `null`, sin
 *    vencidos, sin tipos vacíos, links resueltos, anchos en columnas de 12).
 *  - `resolveHref`: los links que la marca carga a mano en el backoffice
 *    (absolutos a su dominio, sin esquema, rutas del sitio viejo) → link del
 *    storefront.
 *  - `parseSkuCsv` / `collectPageSkus` / `matchSkuRecords`: los SKUs de los
 *    carruseles de productos, para pedirlos TODOS en un solo
 *    `catalog.bySkus()` y repartir las tarjetas por bloque.
 */
import type { Schema } from './types';

export type PageBlock = Schema<'HomeBloque'>;
export type PageBlockType = PageBlock['type'];
export type PageSection = Schema<'HomeSeccion'>;
export type HomePageBlocks = Schema<'HomePageBlocks'>;
export type Landing = Schema<'Landing'>;
export type LandingList = Schema<'LandingLista'>;
export type LandingSummary = Schema<'LandingResumen'>;
export type HomeInstagram = Schema<'HomeInstagram'>;
export type StaticPage = Schema<'PaginaEstatica'>;
export type StaticPageList = Schema<'PaginaEstaticaLista'>;
export type SkuProduct = Schema<'ProductoPorSku'>;
export type SkuProducts = Schema<'ProductosPorSku'>;
/** Un bloque de un tipo puntual: `PageBlockOf<'PageBlock::Banner'>`. */
export type PageBlockOf<T extends PageBlockType> = Extract<PageBlock, { type: T }>;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** Rutas del storefront a las que se llevan las rutas del sitio viejo de la marca. */
export interface StorefrontRoutes {
  /** `/categorias/:slug` → p. ej. `(s) => '/categoria/' + s`. */
  category?: (slug: string) => string;
  /** `/productos/:slug[/...]` → p. ej. `(s) => '/producto/' + s`. */
  product?: (slug: string) => string;
  /** `/pages/:slug` → p. ej. `(s) => '/pages/' + s`. */
  landing?: (slug: string) => string;
  /** `/home` (y `/`) → default `'/'`. */
  home?: string;
}

export interface ResolveHrefOptions {
  /**
   * Hosts propios de la marca (`'www.mimarca.com.ar'`, `'mimarca.com.ar'`…): un
   * link absoluto a uno de ellos pasa a ruta relativa. Se comparan sin `www.`
   * y sin puerto. Se aceptan URLs completas (`'https://www.mimarca.com.ar'`).
   */
  brandHosts?: readonly string[];
  /** Rutas del sitio viejo → rutas de tu storefront (sin esto quedan igual). */
  routes?: StorefrontRoutes;
}

export interface ResolvedHref {
  href: string;
  /** `true` si sale del sitio (otro dominio, `mailto:`, `tel:`): usá `<a>` y no `<Link>`. */
  external: boolean;
}

const ESQUEMA_PELIGROSO = /^(javascript|data|vbscript|file):/i;
const OTRO_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;
const DOMINIO_SIN_ESQUEMA = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i;

const hostPlano = (h: string): string => {
  let x = h.trim().toLowerCase();
  if (/^[a-z]+:\/\//.test(x)) {
    try {
      x = new URL(x).hostname;
    } catch {
      return '';
    }
  }
  return x.replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '');
};

/** Lleva una ruta del sitio viejo (`/categorias/x`, `/productos/y`, `/home`) a la del storefront. */
function mapearRuta(path: string, routes: StorefrontRoutes | undefined): string {
  if (!routes) return path;
  const m = /^([^?#]*)([?#].*)?$/.exec(path)!;
  const ruta = m[1].replace(/\/+$/, '') || '/';
  const cola = m[2] ?? '';
  const seg = ruta.split('/').filter(Boolean);
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if (seg.length === 0 || (seg.length === 1 && seg[0].toLowerCase() === 'home'))
    return (routes.home ?? '/') + cola;
  const [primero, segundo] = seg;
  if (segundo) {
    const p = primero.toLowerCase();
    if (p === 'categorias' && routes.category) return routes.category(dec(seg[seg.length - 1])) + cola;
    if (p === 'productos' && routes.product) return routes.product(dec(segundo)) + cola;
    if (p === 'pages' && routes.landing && seg.length === 2) return routes.landing(dec(segundo)) + cola;
  }
  return path;
}

/**
 * Un `href` cargado a mano en el backoffice → link usable:
 *
 *  1. `''`/espacios/`null` → `null` (no hay link); `javascript:`/`data:` → `null`.
 *  2. `www.marca.com/x` (sin esquema) → `https://www.marca.com/x`; `//x` → `https://x`.
 *  3. Absoluto a un host propio (`brandHosts`) → ruta relativa (con query y hash).
 *  4. Rutas del sitio viejo (`/categorias/:slug`, `/productos/:slug`, `/pages/:slug`, `/home`)
 *     → las de `routes`.
 *  5. Relativo sin `/` inicial (`categorias/x`) → `/categorias/x`.
 *
 * Lo que no es propio queda como externo (`external: true`).
 */
export function resolveHref(
  href: string | null | undefined,
  opts: ResolveHrefOptions = {},
): ResolvedHref | null {
  if (typeof href !== 'string') return null;
  let h = href.trim();
  if (!h || h === '#') return null;
  if (ESQUEMA_PELIGROSO.test(h)) return null;
  if (h.startsWith('#') || h.startsWith('?')) return { href: h, external: false };
  if (h.startsWith('//')) h = `https:${h}`;
  else if (!OTRO_ESQUEMA.test(h) && !h.startsWith('/') && DOMINIO_SIN_ESQUEMA.test(h))
    h = `https://${h}`;

  if (/^https?:\/\//i.test(h)) {
    let url: URL;
    try {
      url = new URL(h);
    } catch {
      return null;
    }
    const propios = new Set((opts.brandHosts ?? []).map(hostPlano).filter(Boolean));
    if (propios.has(hostPlano(url.hostname))) {
      const path = `${url.pathname || '/'}${url.search}${url.hash}`;
      return { href: mapearRuta(path, opts.routes), external: false };
    }
    return { href: url.toString(), external: true };
  }
  if (OTRO_ESQUEMA.test(h)) return { href: h, external: true }; // mailto:, tel:, whatsapp:…
  if (!h.startsWith('/')) h = `/${h}`;
  return { href: mapearRuta(h, opts.routes), external: false };
}

// ---------------------------------------------------------------------------
// SKUs
// ---------------------------------------------------------------------------

/**
 * `"A%S, B%M ,,C"` → `['A%S', 'B%M', 'C']`. Separa por coma, saca espacios,
 * vacíos y repetidos (mantiene el orden). El separador de talle (`%`, `.`,
 * `-`…) cambia por marca y se respeta tal cual.
 */
export function parseSkuCsv(csv: string | null | undefined): string[] {
  if (typeof csv !== 'string') return [];
  const out: string[] = [];
  for (const s of csv.split(',')) {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  }
  return out;
}

/** Los SKUs de un bloque: el CSV principal y el de cada solapa. */
export function skusOfBlock(b: PageBlock): { main: string[]; tabs: string[][] } {
  if (b.type !== 'PageBlock::SkuCarousel') return { main: [], tabs: [] };
  return {
    main: parseSkuCsv(b.sku_carousel),
    tabs: (b.tabs ?? []).map((t) => parseSkuCsv(t.sku_list)),
  };
}

/**
 * TODOS los SKUs de los carruseles de una página (sin repetir, en orden de
 * aparición), para pedirlos en un solo `catalog.bySkus()`.
 */
export function collectPageSkus(
  blocks: readonly PageBlock[] | readonly { blocks: readonly PageBlock[] }[],
): string[] {
  const lista: PageBlock[] = [];
  for (const x of blocks as readonly unknown[]) {
    if (x && typeof x === 'object' && 'type' in x) lista.push(x as PageBlock);
    else if (x && typeof x === 'object' && Array.isArray((x as { blocks?: unknown }).blocks))
      lista.push(...((x as { blocks: (PageBlock | null)[] }).blocks.filter(Boolean) as PageBlock[]));
  }
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const b of lista) {
    const { main, tabs } = skusOfBlock(b);
    for (const s of [...main, ...tabs.flat()])
      if (!vistos.has(s)) {
        vistos.add(s);
        out.push(s);
      }
  }
  return out;
}

const claveDe = (r: SkuProduct) =>
  `${r.pg_id ?? r.slug ?? ''}-${r.variant_id ?? r.variant?._id ?? ''}`;

/**
 * Reparte las tarjetas de un `catalog.bySkus()` de toda la página entre los
 * SKUs de UN bloque: para cada SKU pedido, el record cuyo `variant.sku` o
 * `variant.grouped_skus` lo contiene. Mantiene el orden del CSV y no repite
 * un mismo producto+color (dos talles del mismo color = una tarjeta). Los SKUs
 * sin record (sin stock, despublicados) se saltean.
 */
export function matchSkuRecords(
  records: readonly SkuProduct[],
  skus: readonly string[],
): SkuProduct[] {
  const porSku = new Map<string, SkuProduct>();
  for (const r of records) {
    const v = r.variant;
    const propios = [v?.sku, ...(v?.grouped_skus ?? [])];
    for (const s of propios)
      if (typeof s === 'string' && s && !porSku.has(s)) porSku.set(s, r);
  }
  const usados = new Set<string>();
  const out: SkuProduct[] = [];
  for (const s of skus) {
    const r = porSku.get(s) ?? porSku.get(s.trim());
    if (!r) continue;
    const k = claveDe(r);
    if (usados.has(k)) continue;
    usados.add(k);
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/** Ancho en columnas de una grilla de 12, en mobile (`xs`) y desde tablet (`md`). */
export interface BlockSpan {
  xs: number;
  md: number;
}

export type NormalizedBlock = PageBlock & {
  /** Posición real en la página (1, 2, …): sólo el 1 carga su imagen con prioridad. */
  order: number;
  /** Índice de la sección (fila) a la que pertenece. */
  section: number;
  /** Ancho en columnas de 12 (de `bootstrap_class`, o de `width` si no viene). */
  span: BlockSpan;
};

export interface NormalizedSection {
  index: number;
  blocks: NormalizedBlock[];
}

export interface NormalizedPageBlocks {
  sections: NormalizedSection[];
  /** Los mismos bloques, aplanados y en orden. */
  blocks: NormalizedBlock[];
}

export interface NormalizePageBlocksOptions extends ResolveHrefOptions {
  /** "Ahora" para la vigencia (default `new Date()`). */
  now?: Date;
  /** Tipos a descartar además de los que no tienen contenido (`RandomBannerButton`). */
  skipTypes?: readonly string[];
}

/** Tipos que la API manda pero no tienen nada para dibujar. */
const SIN_CONTENIDO = new Set<string>(['PageBlock::RandomBannerButton']);

const colsDeClase = (c: unknown): number | null => {
  if (typeof c !== 'string') return null;
  const col = /col-(?:xs|sm|md|lg)-(\d{1,2})\b/.exec(c);
  if (col) return clampCols(Number(col[1]));
  const pct = /flex-width-(\d{1,3})p\b/.exec(c);
  if (pct) return colsDePorcentaje(Number(pct[1]));
  return null;
};
const clampCols = (n: number) => Math.min(12, Math.max(1, Math.round(n)));
const colsDePorcentaje = (p: number | null | undefined): number | null =>
  typeof p === 'number' && Number.isFinite(p) && p > 0 ? clampCols((p / 100) * 12) : null;

/** El ancho de un bloque en columnas de 12 (`{xs:'col-xs-12', md:'flex-width-50p'}` → `{xs:12, md:6}`). */
export function blockSpan(b: {
  bootstrap_class?: unknown;
  width?: number | null;
}): BlockSpan {
  const bc = (b.bootstrap_class ?? null) as { xs?: unknown; md?: unknown } | string | null;
  const deWidth = colsDePorcentaje(b.width ?? null) ?? 12;
  if (bc && typeof bc === 'object')
    return { xs: colsDeClase(bc.xs) ?? 12, md: colsDeClase(bc.md) ?? deWidth };
  if (typeof bc === 'string') return { xs: 12, md: colsDeClase(bc) ?? deWidth };
  return { xs: 12, md: deWidth };
}

const fecha = (v: unknown): Date | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * ¿Está vigente? La API ya filtra por fecha en la home; esto es la red de
 * seguridad para una copia cacheada (o una landing, que no filtra): descarta
 * `active: false`, los que vencieron (`active_till` pasado) y los que todavía
 * no arrancan (`active_from` futuro), si esos campos vienen.
 */
export function isBlockActive(b: Record<string, unknown>, now: Date = new Date()): boolean {
  if (b.active === false) return false;
  const desde = fecha(b.active_from);
  const hasta = fecha(b.active_till);
  if (desde && desde.getTime() > now.getTime()) return false;
  if (hasta && hasta.getTime() < now.getTime()) return false;
  return true;
}

/** `&amp;` literal (como viene en los embeds de YouTube de la API) → `&`. */
export const decodeAmp = (s: string | null | undefined): string | null | undefined =>
  typeof s === 'string' ? s.replace(/&amp;/gi, '&') : s;

function conLinks<T extends Record<string, unknown>>(x: T, opts: ResolveHrefOptions): T {
  const out: Record<string, unknown> = { ...x };
  for (const k of ['href', 'second_href'] as const)
    if (k in out) out[k] = resolveHref(out[k] as string | null, opts)?.href ?? null;
  for (const k of ['video_url_desktop', 'video_url_mobile'] as const)
    if (typeof out[k] === 'string') out[k] = decodeAmp(out[k] as string);
  return out as T;
}

/**
 * La respuesta de `content.home()` / `content.landing()` (o directamente sus
 * `page_blocks`) → secciones y bloques listos para dibujar:
 *
 *  - descarta los `null` (tipos que la API no serializa), los no vigentes
 *    (`isBlockActive`) y los tipos sin contenido (`RandomBannerButton`);
 *  - saca las secciones que quedan vacías;
 *  - numera los bloques (`order` 1..n) y les pone su ancho en columnas de 12
 *    (`span`, de `bootstrap_class {xs, md}`);
 *  - resuelve `href`, `second_href` e `items[].href` con `resolveHref`
 *    (el HTML de `RichText.body` NO se toca: sanitizalo y resolvé sus links
 *    vos, en ese orden);
 *  - decodifica `&amp;` en `video_url_desktop/mobile`.
 */
export function normalizePageBlocks(
  input:
    | { page_blocks?: readonly PageSection[] | null }
    | readonly PageSection[]
    | null
    | undefined,
  opts: NormalizePageBlocksOptions = {},
): NormalizedPageBlocks {
  const secciones: readonly PageSection[] = Array.isArray(input)
    ? input
    : ((input as { page_blocks?: readonly PageSection[] | null } | null)?.page_blocks ?? []);
  const now = opts.now ?? new Date();
  const saltear = new Set([...SIN_CONTENIDO, ...(opts.skipTypes ?? [])]);
  const sections: NormalizedSection[] = [];
  const blocks: NormalizedBlock[] = [];
  let order = 0;

  for (const [i, s] of secciones.entries()) {
    if (!s || !Array.isArray(s.blocks)) continue;
    const index = typeof s.section_index === 'number' ? s.section_index : i;
    const propios: NormalizedBlock[] = [];
    for (const b of s.blocks) {
      if (!b || typeof b !== 'object' || typeof b.type !== 'string') continue;
      if (saltear.has(b.type)) continue;
      if (!isBlockActive(b as Record<string, unknown>, now)) continue;
      const base = conLinks(b as Record<string, unknown>, opts) as PageBlock;
      const items = (b as { items?: unknown }).items;
      const conItems = Array.isArray(items)
        ? {
            ...base,
            items: items
              .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === 'object')
              .filter((it) => isBlockActive(it, now))
              .map((it) => conLinks(it, opts)),
          }
        : base;
      const nb = {
        ...conItems,
        order: ++order,
        section: index,
        span: blockSpan(b),
      } as NormalizedBlock;
      propios.push(nb);
      blocks.push(nb);
    }
    if (propios.length) sections.push({ index, blocks: propios });
  }
  return { sections, blocks };
}

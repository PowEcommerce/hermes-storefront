/**
 * Caché por tags del storefront, generada desde la OpenAPI
 * (`x-cache-tags` / `x-cache-ttl` de cada GET). Los nombres de los tags son
 * EXACTAMENTE los que Pow purga y manda en el webhook `storefront/revalidate`:
 * taggeá tus fetch con `cacheTagsFor` (o usá `@hermesecommerce/storefront/next`, que lo
 * hace solo) y purgá con lo que llega en el webhook.
 */
import { CACHE_OPERATIONS, CACHE_TTL_SECONDS } from './generated/cache';

export { CACHE_OPERATIONS, CACHE_TTL_SECONDS };

/** operationId de un GET con caché declarada (`'Pdp_show'`, `'Products_category'`…). */
export type CacheOperation = keyof typeof CACHE_OPERATIONS;

/** `short` (precio/stock), `long` (contenido/config) o `none` (no cachear). */
export type CacheTtl = keyof typeof CACHE_TTL_SECONDS | 'none';

type Plantillas<O extends CacheOperation> =
  (typeof CACHE_OPERATIONS)[O]['tags'][number];
type Placeholders<S> = S extends `${string}{${infer P}}${infer R}`
  ? P | Placeholders<R>
  : never;

/** Los parámetros que usan las plantillas de esa operación (`{ id }`, `{ slug }`…). */
export type CacheParams<O extends CacheOperation> = Partial<
  Record<Placeholders<Plantillas<O>>, string | number | null | undefined>
>;

/** Lo que conviene hacer con la respuesta de un GET. */
export interface CacheInfo {
  operationId: CacheOperation;
  /** Tags ya resueltos (sin `{…}`). */
  tags: string[];
  ttl: CacheTtl;
  /** Segundos del TTL (`false` si `ttl === 'none'`). */
  revalidate: number | false;
}

/** Reemplaza `{x}` por `params.x`; si falta, ese tag no va. */
export function rellenarTags(
  plantillas: readonly string[],
  params: Record<string, unknown> = {},
): string[] {
  const out: string[] = [];
  for (const p of plantillas) {
    let falta = false;
    const tag = p.replace(/\{([^}]+)\}/g, (_, nombre: string) => {
      const v = params[nombre];
      if (
        v === undefined ||
        v === null ||
        v === '' ||
        (typeof v !== 'string' && typeof v !== 'number')
      ) {
        falta = true;
        return '';
      }
      return String(v);
    });
    if (!falta && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Los tags de caché de una operación con sus parámetros:
 *
 * ```ts
 * cacheTagsFor('Pdp_show', { id: 'remera-lisa' }); // ['product', 'product-remera-lisa']
 * cacheTagsFor('Products_category', { slug: 'sale' }); // ['products', 'category-sale']
 * ```
 */
export function cacheTagsFor<O extends CacheOperation>(
  operationId: O,
  params: CacheParams<O> = {} as CacheParams<O>,
): string[] {
  return rellenarTags(
    CACHE_OPERATIONS[operationId].tags,
    params as Record<string, unknown>,
  );
}

const porPath = new Map<string, CacheOperation>(
  (Object.keys(CACHE_OPERATIONS) as CacheOperation[]).map((id) => [
    CACHE_OPERATIONS[id].path,
    id,
  ]),
);

/**
 * Caché de un GET por su path de la spec (`/api/v2/items/{id}`) y sus
 * parámetros (path + query). null si no es un GET con caché declarada.
 */
export function cacheInfoFor(
  method: string,
  pathTemplate: string,
  params: Record<string, unknown> = {},
): CacheInfo | null {
  if (method.toUpperCase() !== 'GET') return null;
  const operationId = porPath.get(pathTemplate);
  if (!operationId) return null;
  const op = CACHE_OPERATIONS[operationId];
  const ttl = op.ttl as CacheTtl;
  return {
    operationId,
    tags: rellenarTags(op.tags, params),
    ttl,
    revalidate:
      ttl === 'none'
        ? false
        : CACHE_TTL_SECONDS[ttl as keyof typeof CACHE_TTL_SECONDS],
  };
}

/**
 * Hook de caché del cliente: recibe la caché del GET y devuelve lo que se
 * mezcla en el `RequestInit` del fetch (p. ej. `{ next: { tags, revalidate } }`).
 * Lo que pases en `fetchOptions` por pedido manda sobre esto.
 */
export type CacheAdapter = (
  info: CacheInfo,
) => Record<string, unknown> | undefined;

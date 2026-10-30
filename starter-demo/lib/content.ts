// Contenido de la marca (page blocks): la home y las landings que se arman en
// el backoffice. Los datos vienen de `hermes.content.*` (cacheados por tags
// `home-page-blocks` / `landings` / `landing-<slug>`, que Hermes purga al
// guardar) y se normalizan con los helpers del SDK.
import 'server-only';
import { cache } from 'react';
import {
  collectPageSkus,
  normalizePageBlocks,
  type NormalizedPageBlocks,
  type PbType,
  type SkuProduct,
} from '@hermesecommerce/storefront';
import { hermes } from './hermes';
import { detalleDeError } from './errors';
import { linkOptions } from './links';
import { versionDeLaRespuesta, type VersionEnPreview } from './preview';

export { ROUTES, brandHosts, linkOptions } from './links';

/** Bloques de la home ya normalizados. Sin bloques (o con la API caída) → secciones vacías. */
export const getHomeBlocks = cache(async (pbType?: PbType): Promise<NormalizedPageBlocks> => {
  try {
    return normalizePageBlocks(await hermes.content.home({ pbType }), linkOptions());
  } catch (e) {
    console.error('[hermes] page blocks de la home:', detalleDeError(e));
    return { sections: [], blocks: [] };
  }
});

/**
 * Los bloques para la vista previa del editor de inicio (`/home/preview`):
 * SIN caché (lo que se acaba de guardar en el admin se tiene que ver en el
 * próximo reload del iframe) y, con `homeVersionToken`, los de esa versión.
 * Un error se tira: la página muestra «no se pudo cargar».
 */
export async function getHomePreview(
  pbType: PbType | undefined,
  homeVersionToken: string | undefined,
): Promise<{ page: NormalizedPageBlocks; version?: VersionEnPreview }> {
  const res = await hermes.content.home({ pbType, homeVersionToken }, { fetchOptions: { cache: 'no-store' } });
  return {
    page: normalizePageBlocks(res, linkOptions()),
    version: versionDeLaRespuesta((res as { preview?: unknown }).preview, homeVersionToken),
  };
}

/** Una landing con sus bloques normalizados; null si no existe (un 5xx se tira: no cachear un 404 falso). */
export const getLanding = cache(async (slug: string) => {
  const landing = await hermes.content.landing(slug);
  if (!landing) return null;
  return { ...landing, blocks: normalizePageBlocks(landing, linkOptions()) };
});

/** Tope de SKUs por pedido de `items?skus=`. */
const MAX_SKUS = 100;

/**
 * Las tarjetas de TODOS los carruseles de SKUs de la página en un solo pedido
 * (en tandas de 100 si hiciera falta). Cada bloque toma las suyas con
 * `matchSkuRecords`. Si el endpoint falla, los carruseles no se dibujan y la
 * página sigue.
 */
export async function productsForBlocks(page: NormalizedPageBlocks): Promise<SkuProduct[]> {
  const skus = collectPageSkus(page.blocks);
  if (!skus.length) return [];
  const tandas: string[][] = [];
  for (let i = 0; i < skus.length; i += MAX_SKUS) tandas.push(skus.slice(i, i + MAX_SKUS));
  try {
    const res = await Promise.all(tandas.map((t) => hermes.catalog.bySkus(t)));
    return res.flatMap((r) => r.records ?? []);
  } catch (e) {
    console.error('[hermes] productos de los carruseles (items?skus=):', detalleDeError(e));
    return [];
  }
}

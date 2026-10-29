/**
 * `@hermesecommerce/storefront/next` — integración con Next.js (App Router).
 *
 *  - `createStorefrontClient`: el mismo cliente, pero cada GET cacheable sale
 *    con `next: { tags, revalidate }` (tags de `x-cache-tags`, TTL de
 *    `x-cache-ttl`: `short` 60 s / `long` 3600 s). Next sirve la copia
 *    vencida y regenera atrás (stale-while-revalidate), así que el TTL es
 *    sólo la red de seguridad: lo que actualiza es la purga.
 *  - `createRevalidateRoute({ secret })`: la Route Handler que recibe el
 *    webhook `storefront/revalidate`, verifica la firma y purga cada tag.
 *
 * Next es peerDependency OPCIONAL: el core (`@hermesecommerce/storefront`) no lo usa.
 */
import { revalidateTag } from 'next/cache';
import {
  createStorefrontClient as crearCliente,
  type StorefrontClientOptions,
} from './client';
import type { CacheAdapter, CacheTtl } from './cache';
import { handleRevalidateWebhook, type RevalidateTag } from './revalidate';
import type { StorefrontRevalidateEvent } from './types';

export interface NextCacheOptions {
  /**
   * Segundos por perfil, si querés otros que los de la spec (`short` 60,
   * `long` 3600). `false` = sin TTL: la entrada vive hasta que llegue una
   * purga (no recomendado: si una purga se pierde, queda vieja para siempre).
   */
  ttl?: Partial<Record<Exclude<CacheTtl, 'none'>, number | false>>;
}

/**
 * El adapter de caché de Next: `next: { tags, revalidate }` en cada GET
 * cacheable y `cache: 'no-store'` en los que la spec marca `none`.
 */
export function nextCacheAdapter(
  opciones: NextCacheOptions = {},
): CacheAdapter {
  return (info) => {
    if (info.ttl === 'none') return { cache: 'no-store' };
    const propio = opciones.ttl?.[info.ttl];
    const revalidate = propio === undefined ? info.revalidate : propio;
    return {
      next: {
        tags: info.tags,
        ...(revalidate === false ? {} : { revalidate }),
      },
    };
  };
}

export type NextStorefrontClientOptions = StorefrontClientOptions & {
  /** TTL por perfil (ver `NextCacheOptions`). Ignorado si pasás `cache`. */
  nextCache?: NextCacheOptions;
};

/**
 * Igual que `createStorefrontClient` de `@hermesecommerce/storefront`, con la caché de
 * Next ya puesta. Para un pedido puntual sin caché:
 * `client.catalog.product(slug, {}, { fetchOptions: { cache: 'no-store' } })`.
 */
export function createStorefrontClient(opts: NextStorefrontClientOptions) {
  const { nextCache, ...resto } = opts;
  return crearCliente({
    ...resto,
    cache: resto.cache ?? nextCacheAdapter(nextCache),
  });
}

/**
 * Cómo purga cada modo:
 *  - Next 16+: `soft` → `revalidateTag(tag, 'max')` (stale-while-revalidate);
 *    `hard` → `revalidateTag(tag, { expire: 0 })` (expira ya: el próximo
 *    pedido espera el dato nuevo). `updateTag` sería el hard nativo, pero
 *    sólo se puede llamar desde una Server Action, no desde una Route Handler.
 *  - Next 14/15: `revalidateTag(tag)` ignora el segundo argumento y siempre
 *    expira la entrada: los dos modos se comportan como `hard`.
 */
export function purgarTagDeNext(t: RevalidateTag): void {
  if (t.mode === 'hard') revalidateTag(t.tag, { expire: 0 });
  else revalidateTag(t.tag, 'max');
}

export interface CreateRevalidateRouteOptions {
  /** El secreto de la suscripción `storefront/revalidate` (`whsec_…`). */
  secret: string | undefined;
  /** Tolerancia del `timestamp` en segundos (default 300). */
  toleranceSec?: number;
  /**
   * Además de purgar la caché de Next (p. ej. tu CDN). Corre DESPUÉS de
   * `revalidateTag`; si tira, se contesta 500 y Pow reintenta.
   */
  onTags?: (
    tags: RevalidateTag[],
    event: StorefrontRevalidateEvent,
  ) => void | Promise<void>;
  /** Reemplaza la purga de Next (tests, o un cache handler propio). */
  revalidate?: (t: RevalidateTag) => void | Promise<void>;
}

/**
 * Route Handler (App Router) para el webhook `storefront/revalidate`:
 *
 * ```ts
 * // app/api/hermes/revalidate/route.ts
 * import { createRevalidateRoute } from '@hermesecommerce/storefront/next';
 * export const POST = createRevalidateRoute({ secret: process.env.HERMES_REVALIDATE_SECRET });
 * ```
 *
 * Contesta 401 con firma inválida, 400 con timestamp viejo, 200 al purgar (y
 * a `webhook/test`), 500 si la purga falla (Pow reintenta).
 */
export function createRevalidateRoute(opciones: CreateRevalidateRouteOptions) {
  const purgar = opciones.revalidate ?? purgarTagDeNext;
  return async function POST(req: Request): Promise<Response> {
    if (!opciones.secret)
      return Response.json(
        { ok: false, revalidated: 0, error: 'Falta el secreto del webhook' },
        { status: 500 },
      );
    const r = await handleRevalidateWebhook({
      rawBody: await req.text(),
      signatureHeader: req.headers.get('x-webhook-signature'),
      secret: opciones.secret,
      toleranceSec: opciones.toleranceSec,
      onTags: async (tags, event) => {
        for (const t of tags) await purgar(t);
        await opciones.onTags?.(tags, event);
      },
    });
    return Response.json(r.body, { status: r.status });
  };
}

export type { RevalidateTag, StorefrontRevalidateEvent };
export { handleRevalidateWebhook };

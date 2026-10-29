/**
 * Receptor del webhook `storefront/revalidate` para cualquier framework (sin
 * dependencias). En Next.js usá `createRevalidateRoute` de
 * `@hermesecommerce/storefront/next`, que arma la Route Handler con esto.
 */
import { verifyWebhook } from './webhooks';
import type { StorefrontRevalidateEvent, WebhookEvent } from './types';

/** Un tag purgado y cómo purgarlo (`soft` = stale-while-revalidate, `hard` = expirar ya). */
export type RevalidateTag = StorefrontRevalidateEvent['tags'][number];

export interface HandleRevalidateWebhookInput {
  /** El cuerpo CRUDO, tal cual llegó (antes de parsear). */
  rawBody: string | Uint8Array | ArrayBuffer;
  /** El header `X-Webhook-Signature`. */
  signatureHeader: string | null | undefined;
  /** El secreto de la suscripción (`whsec_…`). */
  secret: string;
  /** Purgá tu caché acá. Si tira, se contesta 500 y Pow reintenta. */
  onTags: (
    tags: RevalidateTag[],
    event: StorefrontRevalidateEvent,
  ) => void | Promise<void>;
  /** Tolerancia del `timestamp` en segundos (default 300). */
  toleranceSec?: number;
  /** "Ahora" en ms (tests). */
  now?: number;
}

export interface HandleRevalidateWebhookResult {
  /** Status HTTP para contestarle a Pow (2xx = recibido; 401/400 = no reintenta). */
  status: number;
  body: {
    ok: boolean;
    /** Cantidad de tags purgados (0 para `webhook/test` y otros eventos). */
    revalidated: number;
    event?: string;
    error?: string;
  };
}

/**
 * Verifica la firma y el timestamp y llama a `onTags` con los tags del evento
 * `storefront/revalidate`. `webhook/test` (y cualquier otro evento) se
 * contesta 200 sin purgar: así el botón de prueba anda contra esta misma URL.
 *
 * ```ts
 * const r = await handleRevalidateWebhook({
 *   rawBody, signatureHeader: req.headers['x-webhook-signature'], secret,
 *   onTags: (tags) => miCache.purge(tags.map((t) => t.tag)),
 * });
 * res.status(r.status).json(r.body);
 * ```
 */
export async function handleRevalidateWebhook(
  input: HandleRevalidateWebhookInput,
): Promise<HandleRevalidateWebhookResult> {
  const v = await verifyWebhook<WebhookEvent>({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    secret: input.secret,
    toleranceSec: input.toleranceSec,
    now: input.now,
  });
  if (!v.ok)
    return {
      status:
        v.reason === 'timestamp_out_of_range' || v.reason === 'invalid_body'
          ? 400
          : 401,
      body: { ok: false, revalidated: 0, error: v.message },
    };
  const event = v.event as { event?: unknown };
  if (event.event !== 'storefront/revalidate')
    return {
      status: 200,
      body: { ok: true, revalidated: 0, event: String(event.event) },
    };
  const rv = v.event as StorefrontRevalidateEvent;
  const tags = (Array.isArray(rv.tags) ? rv.tags : []).filter(
    (t): t is RevalidateTag =>
      !!t && typeof t.tag === 'string' && t.tag.length > 0,
  );
  try {
    await input.onTags(
      tags.map((t) => ({
        tag: t.tag,
        mode: t.mode === 'hard' ? 'hard' : 'soft',
      })),
      rv,
    );
  } catch (e) {
    return {
      status: 500,
      body: {
        ok: false,
        revalidated: 0,
        event: rv.event,
        error: (e as Error)?.message ?? String(e),
      },
    };
  }
  return {
    status: 200,
    body: { ok: true, revalidated: tags.length, event: rv.event },
  };
}

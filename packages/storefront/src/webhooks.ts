/**
 * Verificación de webhooks de Pow con WebCrypto (Node 18+, Cloudflare
 * Workers, Vercel Edge, Deno, Bun). Sin dependencias.
 *
 * Pow firma cada entrega con `X-Webhook-Signature: sha256=<hex>`:
 * HMAC-SHA256 del cuerpo CRUDO con el secreto de la suscripción (`whsec_…`,
 * tal cual, en UTF-8). El `timestamp` va dentro del cuerpo firmado y se
 * renueva en cada intento: rechazamos los que están fuera de la tolerancia
 * (replays). La idempotencia (`id` repetido en los reintentos) queda de tu
 * lado: guardá los `id` procesados.
 */
import type { WebhookEvent } from './types';

export interface VerifyWebhookInput {
  /** El cuerpo CRUDO, tal cual llegó (antes de parsear): `await req.text()`. */
  rawBody: string | Uint8Array | ArrayBuffer;
  /** El header `X-Webhook-Signature` (`sha256=<hex>`). */
  signatureHeader: string | null | undefined;
  /** El secreto de la suscripción (`whsec_…`). */
  secret: string;
  /** Diferencia máxima, en segundos, entre `timestamp` y tu reloj. Default 300 (5 min). */
  toleranceSec?: number;
  /** "Ahora" en ms (para tests). Default `Date.now()`. */
  now?: number;
}

export type VerifyWebhookResult<E = WebhookEvent> =
  | { ok: true; event: E }
  | {
      ok: false;
      reason:
        | 'missing_signature'
        | 'malformed_signature'
        | 'invalid_signature'
        | 'invalid_body'
        | 'timestamp_out_of_range';
      message: string;
    };

const enc = new TextEncoder();

async function subtle(): Promise<SubtleCrypto> {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.subtle) return g.subtle;
  // Node 18 sin `globalThis.crypto`: usamos el webcrypto de node:crypto.
  // El nombre va en una variable para que ningún bundler intente resolverlo
  // (en Workers/Edge/navegador nunca se llega acá: tienen globalThis.crypto).
  const modulo = 'node:crypto';
  const nodeCrypto = (await import(
    /* webpackIgnore: true */ /* @vite-ignore */ modulo
  )) as {
    webcrypto: Crypto;
  };
  return nodeCrypto.webcrypto.subtle;
}

function bytes(raw: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof raw === 'string') return enc.encode(raw);
  if (raw instanceof Uint8Array) return raw;
  return new Uint8Array(raw);
}

function hexABytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Verifica firma y timestamp de un webhook de Pow. Nunca tira: devuelve
 * `{ ok: true, event }` o `{ ok: false, reason, message }`.
 *
 * ```ts
 * const r = await verifyWebhook({
 *   rawBody: await req.text(),
 *   signatureHeader: req.headers.get('x-webhook-signature'),
 *   secret: process.env.HERMES_WEBHOOK_SECRET!,
 * });
 * if (!r.ok) return new Response(r.message, { status: 401 });
 * ```
 */
export async function verifyWebhook<E = WebhookEvent>(
  input: VerifyWebhookInput,
): Promise<VerifyWebhookResult<E>> {
  const { signatureHeader, secret } = input;
  const toleranceSec = input.toleranceSec ?? 300;
  if (!secret) throw new TypeError('verifyWebhook: falta `secret`.');
  if (!signatureHeader)
    return {
      ok: false,
      reason: 'missing_signature',
      message: 'Falta el header X-Webhook-Signature',
    };

  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  const firma = m ? hexABytes(m[1]) : null;
  if (!firma)
    return {
      ok: false,
      reason: 'malformed_signature',
      message: 'X-Webhook-Signature no es sha256=<hex>',
    };

  const cuerpo = bytes(input.rawBody);
  const s = await subtle();
  const key = await s.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // `verify` compara en tiempo constante.
  const valida = await s.verify(
    'HMAC',
    key,
    firma as BufferSource,
    cuerpo as BufferSource,
  );
  if (!valida)
    return {
      ok: false,
      reason: 'invalid_signature',
      message: 'Firma inválida',
    };

  let event: unknown;
  try {
    event = JSON.parse(
      typeof input.rawBody === 'string'
        ? input.rawBody
        : new TextDecoder().decode(cuerpo),
    );
  } catch {
    return {
      ok: false,
      reason: 'invalid_body',
      message: 'El cuerpo no es JSON',
    };
  }
  const ts =
    event && typeof event === 'object'
      ? Date.parse(String((event as { timestamp?: unknown }).timestamp))
      : NaN;
  if (!Number.isFinite(ts))
    return {
      ok: false,
      reason: 'invalid_body',
      message: 'El cuerpo no trae un `timestamp` válido',
    };
  const ahora = input.now ?? Date.now();
  if (Math.abs(ahora - ts) > toleranceSec * 1000)
    return {
      ok: false,
      reason: 'timestamp_out_of_range',
      message: `Evento fuera de la tolerancia de ${toleranceSec}s (¿replay o reloj desfasado?)`,
    };
  return { ok: true, event: event as E };
}

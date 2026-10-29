import 'server-only';
import { headers } from 'next/headers';

/**
 * URL pública del sitio para el return_url / cancel_url del checkout.
 * `SITE_URL` si está; si no, el host del pedido. El dominio tiene que ser
 * https y estar entre los permitidos del token público
 * (`hermes link --domain …`). En local no se manda (ver lib/checkout.ts).
 */
export async function urlDelSitio(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** IP del comprador, para reenviarla en login/registro (rate limit por IP). */
export async function ipDelComprador(): Promise<Record<string, string>> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip ? { 'X-Forwarded-For': ip } : {};
}

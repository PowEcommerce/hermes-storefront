import 'server-only';
import { cookies } from 'next/headers';
import type { CustomerSession } from '@hermesecommerce/storefront';

// Todo lo del comprador vive en cookies httpOnly del dominio de la tienda:
// el navegador nunca ve los tokens (ni el del carrito ni los de la cuenta).
export const CART_COOKIE = 'hermes_cart';
export const ACCESS_COOKIE = 'hermes_customer';
export const REFRESH_COOKIE = 'hermes_customer_refresh';

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const TREINTA_DIAS = 60 * 60 * 24 * 30;

export async function leerCarrito(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

/** Sólo en Server Actions / Route Handlers. */
export async function guardarCarrito(token: string) {
  (await cookies()).set(CART_COOKIE, token, { ...base, maxAge: TREINTA_DIAS });
}

export async function borrarCarrito() {
  (await cookies()).delete(CART_COOKIE);
}

export async function leerSesion() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
  };
}

type Jar = Awaited<ReturnType<typeof cookies>>;

/** Guarda la sesión del comprador (access 15 min, refresh rotativo). */
export function guardarSesionEn(jar: Pick<Jar, 'set'>, s: CustomerSession) {
  jar.set(ACCESS_COOKIE, s.accessToken, { ...base, maxAge: 60 * 14 });
  jar.set(REFRESH_COOKIE, s.refreshToken, { ...base, maxAge: s.refreshMaxAge ?? TREINTA_DIAS });
}

export async function guardarSesion(s: CustomerSession) {
  guardarSesionEn(await cookies(), s);
}

export async function borrarSesion() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

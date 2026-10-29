// Renueva la sesión del comprador con el refresh token (rotativo) y vuelve a
// la página que lo pidió. Es una Route Handler porque los Server Components no
// pueden escribir cookies.
import { NextResponse, type NextRequest } from 'next/server';
import { isHermesApiError } from '@hermesecommerce/storefront';
import { hermes } from '@/lib/hermes';
import { ACCESS_COOKIE, REFRESH_COOKIE, guardarSesionEn } from '@/lib/cookies';
import { destinoSeguro } from '@/lib/redirects';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Sólo rutas internas (evita open redirects con ?volver=https://…, //… o /\…).
  const destino = destinoSeguro(req.nextUrl.searchParams.get('volver'));
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const ingresar = new URL(`/cuenta/ingresar?volver=${encodeURIComponent(destino)}`, req.url);

  if (!refresh) return NextResponse.redirect(ingresar, 303);
  try {
    const { session } = await hermes.account.refresh(refresh);
    if (!session) throw new Error('sin sesión');
    const res = NextResponse.redirect(new URL(destino, req.url), 303);
    guardarSesionEn(res.cookies, session);
    return res;
  } catch (e) {
    // 409 = otro pedido en paralelo ya rotó el refresh (y escribió las cookies nuevas).
    if (isHermesApiError(e) && e.status === 409) return NextResponse.redirect(new URL(destino, req.url), 303);
    const res = NextResponse.redirect(ingresar, 303);
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }
}

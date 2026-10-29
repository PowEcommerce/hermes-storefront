// Agregar al carrito. El primer add crea el carrito: guardamos el crt_ en una
// cookie httpOnly de nuestro dominio.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isHermesApiError } from '@hermesecommerce/storefront';
import { CART_COOKIE, pow } from '@/lib/pow';

export async function POST(req: Request) {
  const form = await req.formData();
  const variantId = Number(form.get('variant_id'));
  const jar = await cookies();
  try {
    const { cartToken } = await pow.cart.addLine(jar.get(CART_COOKIE)?.value, {
      variant_id: variantId,
      quantity: 1,
    });
    const res = NextResponse.redirect(new URL('/carrito', req.url), 303);
    if (cartToken)
      res.cookies.set(CART_COOKIE, cartToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
    return res;
  } catch (e) {
    // Sin stock, variante inexistente…: { success: false, message } → HermesApiError
    if (isHermesApiError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

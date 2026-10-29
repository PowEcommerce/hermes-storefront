// "Ir a pagar": sesión de checkout hosteado (token PÚBLICO) y 303 a su url.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CART_COOKIE, pow } from '@/lib/pow';

export async function POST(req: Request) {
  const cartToken = (await cookies()).get(CART_COOKIE)?.value;
  if (!cartToken) return NextResponse.redirect(new URL('/carrito', req.url), 303);
  const site = process.env.SITE_URL!;
  const session = await pow.checkoutSessions.create({
    cart_token: cartToken,
    return_url: `${site}/gracias`,
    cancel_url: `${site}/carrito`,
  });
  return NextResponse.redirect(session.url, 303);
}

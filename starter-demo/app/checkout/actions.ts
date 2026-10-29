'use server';

// "Finalizar compra": crea una checkout session (token PÚBLICO, que tiene
// tus dominios permitidos) y manda al comprador al checkout hosteado de la
// marca. Al terminar vuelve a /checkout/vuelta?checkout_session_id=cs_…
// (en desarrollo, sin return_url: ver lib/checkout.ts).
import { redirect } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { leerCarrito } from '@/lib/cookies';
import { detalleDeError, type ErrorDeUrl } from '@/lib/errors';
import { urlsDeVuelta } from '@/lib/checkout';
import { urlDelSitio } from '@/lib/site';

type CrearSesion = Parameters<typeof hermes.checkoutSessions.create>[0];

export async function finalizarCompra(): Promise<void> {
  const cartToken = await leerCarrito();
  if (!cartToken) redirect('/carrito');
  const site = await urlDelSitio();
  let destino: string;
  try {
    // En local, sin return_url/cancel_url (el tipo del SDK hoy las pide).
    const body = { cart_token: cartToken, ...urlsDeVuelta(site) } as CrearSesion;
    const session = await hermes.checkoutSessions.create(body);
    destino = session.url;
  } catch (e) {
    // El detalle (status, request_id, cuerpo) va al log del server; a la URL
    // sólo un código que la página del carrito traduce.
    console.error('[hermes] checkoutSessions.create:', detalleDeError(e));
    const codigo: ErrorDeUrl = 'checkout';
    destino = `/carrito?error=${codigo}`;
  }
  // redirect() tira una excepción de control: va fuera del try.
  redirect(destino);
}

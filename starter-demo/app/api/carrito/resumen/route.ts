// Cantidad de unidades del carrito para el badge del header.
import { hermes } from '@/lib/hermes';
import { leerCarrito } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await leerCarrito();
  if (!token) return Response.json({ count: 0 });
  try {
    const cart = await hermes.cart.get(token);
    const count = cart.items.reduce((n, l) => n + l.quantity, 0);
    return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ count: 0 });
  }
}

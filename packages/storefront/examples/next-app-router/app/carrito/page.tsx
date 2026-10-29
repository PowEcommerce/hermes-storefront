import { cookies } from 'next/headers';
import { CART_COOKIE, pow } from '@/lib/pow';

export const dynamic = 'force-dynamic';

export default async function Carrito() {
  const cartToken = (await cookies()).get(CART_COOKIE)?.value;
  const cart = await pow.cart.get(cartToken);
  if (!cart.has_entries) return <p>El carrito está vacío.</p>;
  return (
    <main>
      <h1>Carrito</h1>
      <ul>
        {cart.items.map((l) => (
          <li key={l.id}>
            {l.title} × {l.quantity}
          </li>
        ))}
      </ul>
      <p>Total: {cart.total}</p>
      <form action="/api/checkout" method="post">
        <button type="submit">Ir a pagar</button>
      </form>
    </main>
  );
}

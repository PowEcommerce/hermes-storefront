// PLP: listado de productos. La caché la pone el cliente de
// `@hermesecommerce/storefront/next` (tags `products`/`settings`, TTL 60 s / 1 h como
// red de seguridad) y la purga llega por el webhook storefront/revalidate.
// El carrito y el checkout no se cachean nunca.
import { pow } from '@/lib/pow';

export default async function Home() {
  const [config, listado] = await Promise.all([
    pow.config.get(),
    pow.catalog.products({ page_number: 1 }),
  ]);

  return (
    <main>
      <h1>Productos ({listado.total})</h1>
      {!config.checkout && <p>Esta marca no tiene checkout hosteado configurado.</p>}
      <ul>
        {listado.items.map((p) => (
          <li key={p.id}>
            {p.title} — {p.variant.price}
            {p.variant.id != null && (
              <form action="/api/cart" method="post">
                <input type="hidden" name="variant_id" value={p.variant.id} />
                <button type="submit">Agregar</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <a href="/carrito">Ver carrito</a>
    </main>
  );
}

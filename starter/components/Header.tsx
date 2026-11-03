import Link from 'next/link';
import type { Brand } from '@/lib/brand';
import { hermes } from '@/lib/hermes';
import { panelVacio, type PanelVacio } from '@/lib/buscador';
import { BuscadorInteligente } from './BuscadorInteligente';
import { CartBadge } from './CartBadge';

async function categorias() {
  try {
    const { categories } = await hermes.catalog.categories();
    return categories;
  } catch (e) {
    console.error('[hermes] no pude leer las categorías:', e);
    return [];
  }
}

/**
 * El panel del buscador inteligente, o `null` si la marca no tiene la app
 * `buscador-inteligente` prendida (entonces queda el campo de siempre).
 * `searchEnabled` nunca tira y va cacheado con el tag `settings`: prender o
 * apagar la app se ve al toque.
 */
async function buscador(): Promise<PanelVacio | null> {
  if (!(await hermes.catalog.searchEnabled())) return null;
  return panelVacio(await hermes.catalog.searchConfig().catch(() => null));
}

export async function Header({ brand }: { brand: Brand }) {
  const [cats, panel] = await Promise.all([categorias(), buscador()]);
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          {brand.logo ? <img src={brand.logo} alt={brand.name} className="h-8 w-auto" /> : brand.name}
        </Link>
        <nav aria-label="Categorías" className="order-3 flex w-full gap-5 overflow-x-auto text-sm md:order-none md:w-auto">
          {cats.map((c) => (
            <Link key={c.id} href={`/categoria/${c.slug}`} className="whitespace-nowrap hover:underline">
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {panel ? (
            <BuscadorInteligente panel={panel} />
          ) : (
            <form action="/buscar" role="search">
              <input name="q" type="search" placeholder="Buscar" aria-label="Buscar" className="input h-9 w-36 md:w-56" />
            </form>
          )}
          <Link href="/cuenta" className="hover:underline">
            Mi cuenta
          </Link>
          <Link href="/carrito" className="hover:underline">
            Carrito <CartBadge />
          </Link>
        </div>
      </div>
    </header>
  );
}

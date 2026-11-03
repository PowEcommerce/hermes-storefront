// Búsqueda: /buscar?q=remera&page=2.
//
// - Con la app `buscador-inteligente` prendida: el buscador nuevo
//   (`catalog.search`: sinónimos, corrección de tipeos, reglas del backoffice).
//   Si una regla redirige el término, se respeta. Se mide la búsqueda y los
//   clics (components/MedirBusqueda.tsx).
// - Sin la app (o apagada): la búsqueda del listado (`catalog.products({ q })`).
import type { Metadata } from 'next';
import { redirect, unstable_rethrow } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { cardFromBuscador, cardFromListado, paginas, type ProductCardData } from '@/lib/catalog';
import { mensajeDeError } from '@/lib/errors';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductCard';
import { MedirBusqueda } from '@/components/MedirBusqueda';

export async function generateMetadata({ searchParams }: PageProps<'/buscar'>): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: typeof q === 'string' && q ? `Resultados para “${q}”` : 'Buscar', robots: { index: false } };
}

export default async function BuscarPage({ searchParams }: PageProps<'/buscar'>) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  const page = Math.max(1, Number(sp.page) || 1);

  if (!q)
    return (
      <form action="/buscar" className="mx-auto max-w-md space-y-3 py-10">
        <h1 className="text-2xl font-semibold">Buscar</h1>
        <input name="q" type="search" className="input" placeholder="¿Qué estás buscando?" autoFocus />
      </form>
    );

  const inteligente = await hermes.catalog.searchEnabled();
  try {
    return inteligente ? await conBuscadorInteligente(q, page, sp) : await conElListado(q, page, sp);
  } catch (e) {
    unstable_rethrow(e); // el redirect() de una regla del backoffice tira a propósito: que siga
    return <p className="text-danger">{mensajeDeError(e, 'No pudimos buscar. Probá de nuevo.')}</p>;
  }
}

type SP = Awaited<PageProps<'/buscar'>['searchParams']>;

async function conBuscadorInteligente(q: string, page: number, sp: SP) {
  const resultado = await hermes.catalog.search(q, { page_number: page });
  if (resultado.redirect) redirect(resultado.redirect);

  // El tamaño de página lo decide la marca: lo sacamos de la página 1 (cacheada).
  const porPagina =
    page === 1 ? resultado.items.length : (await hermes.catalog.search(q, { page_number: 1 }).catch(() => resultado)).items.length;
  const desde = (page - 1) * porPagina;
  const productos: ProductCardData[] = [];
  const medidos: { slug: string; pg_id: number; position: number }[] = [];
  resultado.items.forEach((item, i) => {
    const card = cardFromBuscador(item);
    if (!card) return;
    productos.push(card);
    if (typeof item.pg_id === 'number') medidos.push({ slug: card.slug, pg_id: item.pg_id, position: desde + i + 1 });
  });

  return (
    <Resultados q={q} total={resultado.total} corregido={resultado.corrected_query}>
      <MedirBusqueda termino={q} total={resultado.total} attributionToken={resultado.attribution_token} productos={medidos}>
        <ProductGrid products={productos} />
      </MedirBusqueda>
      <Pagination base="/buscar" searchParams={sp} page={page} pages={paginas(resultado.total, porPagina)} />
    </Resultados>
  );
}

async function conElListado(q: string, page: number, sp: SP) {
  const listado = await hermes.catalog.products({ q, page_number: page });
  return (
    <Resultados q={q} total={listado.total} corregido={null}>
      <ProductGrid products={listado.items.map(cardFromListado)} />
      <Pagination base="/buscar" searchParams={sp} page={page} pages={paginas(listado.total, listado.items_per_page)} />
    </Resultados>
  );
}

function Resultados({
  q,
  total,
  corregido,
  children,
}: {
  q: string;
  total: number;
  corregido: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Resultados para “{q}”</h1>
      <p className="mb-8 text-sm text-muted-fg">
        {total} {total === 1 ? 'producto' : 'productos'}
        {corregido && <> · Mostrando resultados para “{corregido}”</>}
      </p>
      {children}
    </div>
  );
}

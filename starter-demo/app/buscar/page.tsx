// Búsqueda: /buscar?q=remera&page=2. Si el backoffice tiene una regla de
// redirección para el término, se respeta.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { cardFromBuscador, paginas, type ProductCardData } from '@/lib/catalog';
import { mensajeDeError } from '@/lib/errors';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductCard';

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
      <form action="/buscar" className="ui-pagina mx-auto max-w-xl space-y-4 py-16">
        <h1 className="ui-t-titulo">Buscar</h1>
        <input name="q" type="search" className="input" placeholder="¿Qué estás buscando?" autoFocus />
      </form>
    );

  let resultado;
  try {
    resultado = await hermes.catalog.search(q, { page_number: page });
  } catch (e) {
    return (
      <div className="ui-pagina">
        <p className="text-danger">{mensajeDeError(e, 'No pudimos buscar. Probá de nuevo.')}</p>
      </div>
    );
  }
  if (resultado.redirect) redirect(resultado.redirect);

  const productos = resultado.items.map(cardFromBuscador).filter((p): p is ProductCardData => p !== null);
  // El tamaño de página lo decide la marca: lo sacamos de la página 1 (cacheada).
  const porPagina =
    page === 1 ? resultado.items.length : (await hermes.catalog.search(q, { page_number: 1 }).catch(() => resultado)).items.length;

  return (
    <div className="ui-pagina">
      <h1 className="ui-t-titulo mb-1">Resultados para “{q}”</h1>
      <p className="ui-t-cuerpo mb-8 border-b border-border pb-4 text-muted-fg">
        {resultado.total} {resultado.total === 1 ? 'producto' : 'productos'}
        {resultado.corrected_query && <> · Mostrando resultados para “{resultado.corrected_query}”</>}
      </p>
      <ProductGrid products={productos} />
      <Pagination base="/buscar" searchParams={sp} page={page} pages={paginas(resultado.total, porPagina)} />
    </div>
  );
}

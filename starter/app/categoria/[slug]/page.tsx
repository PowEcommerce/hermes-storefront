// PLP: listado de una categoría con filtros (las facetas de `catalog.filters`),
// orden y paginación, todo en la URL. Los datos salen de la caché de Next por
// tags (`products`, `category-<slug>`) y se purgan con storefront/revalidate.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { cardFromListado, facetasDe, paginas, queryDeLaUrl } from '@/lib/catalog';
import { esNoEncontrado } from '@/lib/errors';
import { Filters } from '@/components/Filters';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductCard';

export async function generateMetadata({ params }: PageProps<'/categoria/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { category } = await hermes.catalog.products({ category: slug, page_number: 1 });
    return {
      title: category?.meta_title || category?.name || slug,
      description: category?.meta_description ?? undefined,
    };
  } catch {
    return { title: slug };
  }
}

export default async function CategoriaPage({ params, searchParams }: PageProps<'/categoria/[slug]'>) {
  const { slug } = await params;
  const sp = await searchParams;

  const filtros = await hermes.catalog.filters({ category_name: slug }).catch(() => null);
  const facetas = facetasDe(filtros);
  const query = queryDeLaUrl(
    sp,
    facetas.map((f) => f.key),
  );

  let listado;
  try {
    listado = await hermes.catalog.products({ ...query, category: slug });
  } catch (e) {
    if (esNoEncontrado(e)) notFound();
    throw e;
  }
  const base = `/categoria/${slug}`;
  const page = query.page_number ?? 1;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">{listado.category?.name ?? slug}</h1>
        <p className="mt-1 text-sm text-muted-fg">
          {listado.total} {listado.total === 1 ? 'producto' : 'productos'}
        </p>
      </header>
      <div className="grid gap-10 md:grid-cols-[240px_1fr]">
        <aside>
          <Filters base={base} facetas={facetas} searchParams={sp} />
        </aside>
        <section>
          <ProductGrid products={listado.items.map(cardFromListado)} />
          <Pagination base={base} searchParams={sp} page={page} pages={paginas(listado.total, listado.items_per_page)} />
        </section>
      </div>
    </div>
  );
}

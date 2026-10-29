// PLP: listado de una categoría con filtros (las facetas de `catalog.filters`),
// orden y paginación, todo en la URL. Los datos salen de la caché de Next por
// tags (`products`, `category-<slug>`) y se purgan con storefront/revalidate.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { cardFromListado, elegidos, facetasDe, paginas, queryDeLaUrl } from '@/lib/catalog';
import { esNoEncontrado } from '@/lib/errors';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductCard';
import { Filtros } from '@/components/plp/Filtros';
import { Toolbar } from '@/components/plp/Toolbar';
import styles from '@/components/plp/Plp.module.css';

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
  const nombre = listado.category?.name ?? slug;
  const hayFiltros = facetas.some((f) => elegidos(sp, f.key).length > 0);

  return (
    <div>
      <header className={styles.cabecera}>
        <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: nombre }]} />
        <h1 className={styles.titulo}>{nombre}</h1>
        {listado.category?.meta_description && <p className={styles.bajada}>{listado.category.meta_description}</p>}
      </header>
      <Toolbar base={base} searchParams={sp} facetas={facetas} total={listado.total}>
        <Filtros base={base} facetas={facetas} searchParams={sp} />
      </Toolbar>
      <section className={styles.listado} aria-label="Productos">
        <ProductGrid products={listado.items.map(cardFromListado)} primeraFila={page === 1 && !hayFiltros ? 3 : 0} />
        <Pagination base={base} searchParams={sp} page={page} pages={paginas(listado.total, listado.items_per_page)} />
      </section>
    </div>
  );
}

// Home. Si la marca armó su home en el backoffice (page blocks), se dibujan
// esos bloques; si no tiene ninguno (marca nueva), cae al banner de la marca +
// destacados. Página estática con ISR: los fetch salen con los tags/TTL de la
// spec (`home-page-blocks` 60 s, `products`…) y el webhook
// storefront/revalidate la regenera cuando se guarda algo en el backoffice.
import Link from 'next/link';
import { hermes } from '@/lib/hermes';
import { getBrand } from '@/lib/brand';
import { cardFromListado } from '@/lib/catalog';
import { getHomeBlocks, productsForBlocks } from '@/lib/content';
import { ProductGrid } from '@/components/ProductCard';
import { PageBlocks } from '@/components/blocks/PageBlocks';

const DESTACADOS = 8;

export default async function Home() {
  const page = await getHomeBlocks();
  if (page.blocks.length) {
    const products = await productsForBlocks(page);
    return <PageBlocks page={page} products={products} />;
  }
  return <HomeSinBloques />;
}

async function HomeSinBloques() {
  const [brand, listado, cats] = await Promise.all([
    getBrand(),
    // Sin orden explícito, el listado viene en el orden "destacados" de la marca.
    hermes.catalog.products({ page_number: 1 }).catch((e) => {
      console.error('[hermes] productos de la home:', e);
      return null;
    }),
    hermes.catalog.categories().catch(() => null),
  ]);
  const primera = cats?.categories[0];
  const productos = (listado?.items ?? []).slice(0, DESTACADOS).map(cardFromListado);

  return (
    <div className="space-y-14">
      <section className="flex min-h-[340px] flex-col items-start justify-center gap-5 rounded-brand bg-primary px-8 py-14 text-primary-fg md:px-14">
        <p className="text-sm uppercase tracking-widest opacity-80">Nueva temporada</p>
        <h1 className="max-w-xl text-4xl font-semibold md:text-5xl">{brand.name}</h1>
        <p className="max-w-md opacity-90">Descubrí lo nuevo y comprá online con envío a todo el país.</p>
        {primera && (
          <Link
            href={`/categoria/${primera.slug}`}
            className="inline-flex h-11 items-center rounded-brand bg-primary-fg px-6 text-sm font-medium text-primary"
          >
            Ver {primera.name}
          </Link>
        )}
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Destacados</h2>
          {primera && (
            <Link href={`/categoria/${primera.slug}`} className="text-sm underline">
              Ver todo
            </Link>
          )}
        </div>
        <ProductGrid products={productos} />
      </section>
    </div>
  );
}

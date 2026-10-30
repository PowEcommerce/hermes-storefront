// Home. Si la marca armó su home en el backoffice (page blocks), se dibujan
// esos bloques (el primero de imagen como hero, debajo del header
// transparente); si no tiene ninguno (marca nueva, o la API no responde en el
// build), cae a una home armada con la marca: hero con su nombre, destacados
// y las categorías. Página estática con ISR: los fetch salen con los tags/TTL
// de la spec (`home-page-blocks` 60 s, `products`…) y el webhook
// storefront/revalidate la regenera cuando se guarda algo en el backoffice.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { hermes } from '@/lib/hermes';
import { getBrand } from '@/lib/brand';
import { cardFromListado } from '@/lib/catalog';
import { getHomeBlocks, productsForBlocks } from '@/lib/content';
import { ProductCard } from '@/components/ProductCard';
import { PageBlocks } from '@/components/blocks/PageBlocks';
import { FilaDeProductos } from '@/components/blocks/FilaDeProductos';
import styles from './home.module.css';

const DESTACADOS = 12;

export default async function Home() {
  const [page, brand] = await Promise.all([getHomeBlocks(), getBrand()]);
  if (page.blocks.length) {
    const products = await productsForBlocks(page);
    return (
      <>
        {/* El h1 de la home: los bloques del backoffice traen h2. */}
        <h1 className="ui-solo-lectores">{brand.name}</h1>
        <PageBlocks page={page} products={products} />
      </>
    );
  }
  return <HomeSinBloques nombre={brand.name} />;
}

async function HomeSinBloques({ nombre }: { nombre: string }) {
  const [listado, cats] = await Promise.all([
    // Sin orden explícito, el listado viene en el orden "destacados" de la marca.
    hermes.catalog.products({ page_number: 1 }).catch((e) => {
      console.error('[hermes] productos de la home:', e);
      return null;
    }),
    hermes.catalog.categories().catch(() => null),
  ]);
  const categorias = (cats?.categories ?? []).filter((c) => c.slug && c.name);
  const primera = categorias[0];
  const productos = (listado?.items ?? []).slice(0, DESTACADOS).map(cardFromListado);
  const foto = (c: (typeof categorias)[number]) => c.dropdown_images?.find((d) => d.image && /^https?:\/\//.test(d.image))?.image ?? null;

  return (
    <>
      {process.env.NODE_ENV === 'development' && <AvisoDeHomeDeEjemplo />}
      <section className={styles.hero} data-hero="">
        <div className={styles.heroTextos}>
          <p className={styles.kicker}>Nueva temporada</p>
          <h1 className={styles.titulo}>{nombre}</h1>
          {primera && (
            <Link href={`/categoria/${primera.slug}`} className={`ui-boton ui-boton--blanco ${styles.boton}`}>
              Ver {primera.name} <ArrowRight size={20} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </section>

      {productos.length > 0 && (
        <section className={styles.destacados}>
          <FilaDeProductos
            titulo={<h2 className="ui-t-h2">Destacados</h2>}
            extra={
              primera ? (
                <Link href={`/categoria/${primera.slug}`} className="ui-enlace ui-t-cuerpo">
                  Ver todo
                </Link>
              ) : null
            }
          >
            {productos.map((p) => (
              <li key={p.key} className={styles.item}>
                <ProductCard product={p} variante="chica" />
              </li>
            ))}
          </FilaDeProductos>
        </section>
      )}

      {categorias.length > 0 && (
        <section className={styles.categorias}>
          <h2 className="ui-t-h2">Categorías</h2>
          <ul className={styles.tiles}>
            {categorias.slice(0, 6).map((c) => {
              const img = foto(c);
              return (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className={styles.tile}>
                    <span className={styles.tileFoto}>{img && <img src={img} alt="" loading="lazy" decoding="async" />}</span>
                    <span className={styles.tileNombre}>{c.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Sólo en desarrollo (`hermes dev`): esta home es la de respaldo, la que sale
 * cuando la marca no armó la suya. En producción no se muestra.
 */
function AvisoDeHomeDeEjemplo() {
  return (
    <p
      role="note"
      className="fixed bottom-4 left-4 z-[1500] max-w-[min(420px,calc(100%-32px))] rounded-md bg-black/80 px-3 py-2 text-xs leading-snug text-white shadow"
    >
      Esta es la home de ejemplo: cargá la tuya desde el admin (Contenido › Página de inicio).
    </p>
  );
}

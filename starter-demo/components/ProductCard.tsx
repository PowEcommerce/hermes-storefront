// Tarjeta de producto: la misma en la PLP, la búsqueda, los carruseles de la
// home y los relacionados de la ficha.
//
//   foto 3/4 radio 10 sobre el fondo de foto; en hover, la segunda foto
//   cucardas como TEXTO arriba del nombre (12/500; el % OFF en el color de oferta)
//   nombre 20/400 en una línea, con los colores a la derecha
//   precio 16/400 (en oferta: el precio en color de oferta y el de lista tachado)
import Link from 'next/link';
import type { ProductCardData } from '@/lib/catalog';
import styles from './ProductCard.module.css';

export function ProductGrid({ products, primeraFila = 0 }: { products: ProductCardData[]; primeraFila?: number }) {
  if (!products.length)
    return (
      <div className={styles.vacia}>
        <p className={styles.vaciaTitulo}>No hay productos para mostrar.</p>
        <p className={styles.vaciaTexto}>Probá con otros filtros o volvé más tarde.</p>
      </div>
    );
  return (
    <ul className={styles.grilla}>
      {products.map((p, i) => (
        <li key={p.key}>
          <ProductCard product={p} prioridad={i < primeraFila} />
        </li>
      ))}
    </ul>
  );
}

export function ProductCard({
  product: p,
  prioridad = false,
  variante,
}: {
  product: ProductCardData;
  /** Primera fila de la grilla: la foto carga ya (no lazy). */
  prioridad?: boolean;
  /** 'chica': la de los carruseles en celular (textos un paso más chicos). */
  variante?: 'chica';
}) {
  const href = `/producto/${p.slug}`;
  const cucardas = [...(p.discount ? [`${p.discount}% OFF`] : []), ...p.badges];
  return (
    <article className={`${styles.card} ${variante === 'chica' ? styles.chica : ''}`}>
      <Link href={href} className={styles.foto} tabIndex={-1} aria-hidden="true">
        {p.image && (
          <img
            src={p.image}
            alt=""
            className={styles.imagen}
            loading={prioridad ? 'eager' : 'lazy'}
            decoding={prioridad ? 'sync' : 'async'}
          />
        )}
        {p.imageHover && <img src={p.imageHover} alt="" className={styles.imagenHover} loading="lazy" decoding="async" />}
      </Link>

      <div className={styles.datos}>
        {cucardas.length > 0 && (
          <p className={styles.cucardas}>
            {cucardas.map((c, i) => (
              <span key={c} className={i === 0 && p.discount ? styles.cucardaOferta : undefined}>
                {c}
              </span>
            ))}
          </p>
        )}

        <div className={styles.filaTitulo}>
          <Link href={href} className={styles.titulo}>
            {p.title}
          </Link>
          {p.colors.length > 1 && (
            <ul className={styles.swatches} aria-label={`Colores: ${p.colors.map((c) => c.name).join(', ')}`}>
              {p.colors.slice(0, 5).map((c) => (
                <li key={c.hex + c.name} className={styles.swatch} style={{ backgroundColor: c.hex }} title={c.name} />
              ))}
            </ul>
          )}
        </div>

        {p.price && (
          <p className={styles.precio}>
            {p.compareAt ? (
              <>
                <span className={styles.precioOferta}>{p.price}</span>{' '}
                <s className={styles.precioTachado}>{p.compareAt}</s>
              </>
            ) : (
              p.price
            )}
          </p>
        )}
      </div>
    </article>
  );
}

import { matchSkuRecords, parseSkuCsv, type SkuProduct } from '@hermesecommerce/storefront';
import { cardsFor, type ProductCardData } from '@/lib/catalog';
import { ProductCard } from '@/components/ProductCard';
import { FilaDeProductos } from './FilaDeProductos';
import { SkuTabs } from './SkuTabs';
import { BlockImage, BlockLink, texto, type BlockProps } from './shared';
import styles from './Blocks.module.css';

/** ¿Le queda algún producto a este carrusel? (si no, ni se reserva su lugar en la grilla). */
export function skuCarouselHasProducts(
  b: { sku_carousel?: string | null; tabs?: { sku_list?: string | null }[] | null },
  products: readonly SkuProduct[],
): boolean {
  if (!products.length) return false;
  return [b.sku_carousel, ...(b.tabs ?? []).map((t) => t.sku_list)].some((csv) => matchSkuRecords(products, parseSkuCsv(csv)).length > 0);
}

function Tarjetas({ cards }: { cards: ProductCardData[] }) {
  return cards.map((p) => (
    <li key={p.key} className={styles.filaItem}>
      <ProductCard product={p} variante="chica" />
    </li>
  ));
}

/**
 * Carrusel de productos por SKU. No pide nada: recibe los records del ÚNICO
 * `catalog.bySkus` de la página (lib/content.ts → productsForBlocks) y se
 * queda con los suyos, en el orden del CSV. Dos modos según el ancho:
 *
 *   - ancho completo: título H2 + flechas y una fila de tarjetas de 436
 *     (153 en celular) que asoma cortada contra el borde derecho;
 *   - media pantalla (fila editorial junto a un banner): una tarjeta por vez.
 *
 * Con solapas, una fila por solapa. Con foto lateral (`image`), la foto va a
 * la izquierda en el 40%. Sin productos (sin stock, endpoint caído), no se dibuja.
 */
export function SkuCarouselBlock({
  block: b,
  priority,
  products,
}: BlockProps<'PageBlock::SkuCarousel'> & { products: readonly SkuProduct[] }) {
  const tabs = (b.tabs ?? [])
    .map((t, i) => ({ id: t.id ?? i, label: texto(t.label) ?? `Solapa ${i + 1}`, cards: cardsFor(products, parseSkuCsv(t.sku_list)) }))
    .filter((t) => t.cards.length > 0);
  const principal = cardsFor(products, parseSkuCsv(b.sku_carousel));
  if (!tabs.length && !principal.length) return null;

  const tituloTexto = texto(b.title);
  const titulo = tituloTexto ? <h2 className={styles.filaTitulo}>{tituloTexto}</h2> : <span />;
  const columna = b.span.md <= 6;
  const verTodo = b.href ? (
    <BlockLink href={b.href} className={`ui-enlace ${styles.verTodo}`}>
      Ver todo
    </BlockLink>
  ) : null;
  const lateral = texto(b.image) || texto(b.mobile_image);

  const contenido = tabs.length ? (
    <SkuTabs titulo={titulo} labels={tabs.map((t) => t.label)}>
      {tabs.map((t) => (
        <FilaDeProductos key={t.id} extra={verTodo} columna={columna}>
          <Tarjetas cards={t.cards} />
        </FilaDeProductos>
      ))}
    </SkuTabs>
  ) : (
    <FilaDeProductos titulo={titulo} extra={verTodo} columna={columna}>
      <Tarjetas cards={principal} />
    </FilaDeProductos>
  );

  return (
    <section className={`${styles.sku} ${columna ? styles.skuColumna : ''}`}>
      {lateral ? (
        <div className={styles.conLateral}>
          <BlockLink href={b.href} className={styles.lateral}>
            <BlockImage block={b} image={b.image} mobileImage={b.mobile_image} alt={tituloTexto ?? b.name ?? ''} priority={priority} className={styles.lateralImagen} />
          </BlockLink>
          <div className={styles.conLateralFila}>{contenido}</div>
        </div>
      ) : (
        contenido
      )}
    </section>
  );
}

import { matchSkuRecords, parseSkuCsv, type SkuProduct } from '@hermesecommerce/storefront';
import { cardsFor, type ProductCardData } from '@/lib/catalog';
import { ProductCard } from '@/components/ProductCard';
import { SkuTabs } from './SkuTabs';
import { BlockImage, BlockLink, texto, type BlockProps } from './shared';

/** ¿Le queda algún producto a este carrusel? (si no, ni se reserva su lugar en la grilla). */
export function skuCarouselHasProducts(
  b: { sku_carousel?: string | null; tabs?: { sku_list?: string | null }[] | null },
  products: readonly SkuProduct[],
): boolean {
  if (!products.length) return false;
  return [b.sku_carousel, ...(b.tabs ?? []).map((t) => t.sku_list)].some((csv) => matchSkuRecords(products, parseSkuCsv(csv)).length > 0);
}

function Fila({ cards, angosto }: { cards: ProductCardData[]; angosto: boolean }) {
  return (
    <ul className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
      {cards.map((p) => (
        <li
          key={p.key}
          className={`shrink-0 snap-start ${angosto ? 'w-[46%] @xl:w-[30%]' : 'w-[46%] @xl:w-[30%] @4xl:w-[23%]'}`}
        >
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Carrusel de productos por SKU. No pide nada: recibe los records del ÚNICO
 * `catalog.bySkus` de la página (lib/content.ts → productsForBlocks) y se
 * queda con los suyos, en el orden del CSV. Con solapas, una fila por solapa.
 * Sin productos (sin stock, endpoint caído), no se dibuja.
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

  const titulo = texto(b.title);
  const lateral = texto(b.image) || texto(b.mobile_image);
  const angosto = Boolean(lateral);
  const contenido = tabs.length ? (
    <SkuTabs labels={tabs.map((t) => t.label)}>
      {tabs.map((t) => (
        <Fila key={t.id} cards={t.cards} angosto={angosto} />
      ))}
    </SkuTabs>
  ) : (
    <Fila cards={principal} angosto={angosto} />
  );

  return (
    <section className="@container space-y-4">
      {(titulo || b.href) && (
        <div className="flex items-end justify-between gap-4">
          {titulo && <h2 className="text-2xl font-semibold">{titulo}</h2>}
          {b.href && (
            <BlockLink href={b.href} className="shrink-0 text-sm underline">
              Ver todo
            </BlockLink>
          )}
        </div>
      )}
      {lateral ? (
        <div className="grid gap-4 md:grid-cols-3">
          <BlockLink href={b.href} className="block overflow-hidden rounded-brand">
            <BlockImage
              block={b}
              image={b.image}
              mobileImage={b.mobile_image}
              alt={titulo ?? b.name ?? ''}
              priority={priority}
              className="block h-full w-full object-cover"
            />
          </BlockLink>
          <div className="@container min-w-0 md:col-span-2">{contenido}</div>
        </div>
      ) : (
        contenido
      )}
    </section>
  );
}

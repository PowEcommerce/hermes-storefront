// Renderer de page blocks (home y landings). Server Component: dibuja las
// secciones en orden, cada una como una fila de una grilla de 12 columnas con
// el ancho de cada bloque en mobile (xs) y desde tablet (md).
//
// Para sumar o pisar un tipo: <PageBlocks components={{ 'PageBlock::ShopTheLook': MiShop }} />.
import type { ComponentType } from 'react';
import type { NormalizedBlock, NormalizedPageBlocks, PageBlockType, SkuProduct } from '@hermesecommerce/storefront';
import { BannerBlock } from './BannerBlock';
import { BannerButtonBlock } from './BannerButtonBlock';
import { CarouselBlock } from './CarouselBlock';
import { RichTextBlock } from './RichTextBlock';
import { SkuCarouselBlock, skuCarouselHasProducts } from './SkuCarouselBlock';
import { VideoBlock } from './VideoBlock';
import type { BlockProps } from './shared';

/** Lo que recibe cualquier componente de bloque (los de SKUs, además, los productos de la página). */
export type AnyBlockProps = BlockProps & { products: readonly SkuProduct[] };
export type BlockComponents = Partial<Record<PageBlockType, ComponentType<AnyBlockProps>>>;

const as = <T extends PageBlockType>(c: ComponentType<BlockProps<T> & { products: readonly SkuProduct[] }>) =>
  c as unknown as ComponentType<AnyBlockProps>;

/** Los tipos que el starter dibuja (98% de los bloques activos en prod). */
export const BLOCKS: BlockComponents = {
  'PageBlock::Banner': as(BannerBlock),
  'PageBlock::BannerButton': as(BannerButtonBlock),
  'PageBlock::RichText': as(RichTextBlock),
  'PageBlock::Carousel': as(CarouselBlock),
  'PageBlock::SkuCarousel': as(SkuCarouselBlock),
  'PageBlock::Video': as(VideoBlock),
};

// Tailwind necesita las clases completas en el código: una por ancho.
const XS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
  7: 'col-span-7', 8: 'col-span-8', 9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
};
const MD: Record<number, string> = {
  1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4', 5: 'md:col-span-5', 6: 'md:col-span-6',
  7: 'md:col-span-7', 8: 'md:col-span-8', 9: 'md:col-span-9', 10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12',
};

const DEV = process.env.NODE_ENV !== 'production';
const avisados = new Set<string>();

/** Tipo sin componente: en desarrollo, aviso en consola (una vez por tipo) y un recuadro visible; en producción, nada. */
function SinComponente({ block }: { block: NormalizedBlock }) {
  if (!DEV) return null;
  if (!avisados.has(block.type)) {
    avisados.add(block.type);
    console.warn(`[hermes] bloque sin componente: ${block.type} (id ${block.id}). Sumalo en components/blocks/PageBlocks.tsx.`);
  }
  return (
    <div className="flex min-h-24 items-center justify-center rounded-brand border-2 border-dashed border-border p-4 text-center text-xs text-muted-fg">
      Bloque sin componente: <code className="mx-1 font-mono">{block.type}</code> (id {block.id}) — sólo se ve en desarrollo
    </div>
  );
}

export function PageBlocks({
  page,
  products = [],
  components,
}: {
  page: NormalizedPageBlocks;
  /** Los records del `catalog.bySkus` único de la página (lib/content.ts → productsForBlocks). */
  products?: readonly SkuProduct[];
  components?: BlockComponents;
}) {
  const registro = { ...BLOCKS, ...components };
  // Un carrusel de SKUs sin productos (sin stock, o el endpoint no respondió)
  // no ocupa lugar; y una sección que queda vacía, tampoco.
  const sections = page.sections
    .map((s) => ({
      ...s,
      blocks: s.blocks.filter(
        (b) => b.type !== 'PageBlock::SkuCarousel' || components?.[b.type] || skuCarouselHasProducts(b, products),
      ),
    }))
    .filter((s) => s.blocks.length > 0);
  return (
    <div className="space-y-10 md:space-y-14">
      {sections.map((s) => (
        <section
          key={s.index}
          className="grid grid-cols-12 gap-4 md:gap-6"
          data-section={s.index}
          data-block-type={s.blocks.map((b) => b.type.replace('PageBlock::', '')).join(' ')}
          data-block-ids={s.blocks.map((b) => b.id).join(' ')}
        >
          {s.blocks.map((b) => {
            const C = registro[b.type];
            return (
              <div key={b.id} className={`min-w-0 ${XS[b.span.xs] ?? XS[12]} ${MD[b.span.md] ?? MD[12]}`} data-block-id={b.id}>
                {C ? <C block={b} priority={b.order === 1} products={products} /> : <SinComponente block={b} />}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

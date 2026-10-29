// Renderer de page blocks (home y landings). Server Component: dibuja las
// secciones en orden, cada una como una fila de una grilla de 12 columnas con
// el ancho de cada bloque en mobile (xs) y desde tablet (md). Los bloques van
// a sangre y sin separación (las filas editoriales son banner + carrusel de
// media pantalla pegados); cada bloque pone su propio aire.
//
// La primera sección, si es de imagen (Banner, BannerButton, Carousel o Video
// a ancho completo), es el HERO: lleva `data-hero` y sube debajo del header,
// que se vuelve transparente encima (ver components/header).
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
import styles from './Blocks.module.css';

/** Lo que recibe cualquier componente de bloque (los de SKUs, además, los productos de la página). */
export type AnyBlockProps = BlockProps & { products: readonly SkuProduct[] };
export type BlockComponents = Partial<Record<PageBlockType, ComponentType<AnyBlockProps>>>;

const as = <T extends PageBlockType>(c: ComponentType<BlockProps<T> & { products: readonly SkuProduct[] }>) =>
  c as unknown as ComponentType<AnyBlockProps>;

/** Los tipos que la tienda dibuja (98% de los bloques activos en prod). */
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

/** Tipos que pueden ser el hero de la página (la foto que va debajo del header transparente). */
const DE_IMAGEN = new Set<PageBlockType>(['PageBlock::Banner', 'PageBlock::BannerButton', 'PageBlock::Carousel', 'PageBlock::Video']);
const avisados = new Set<string>();

/** Tipo sin componente: en desarrollo, aviso en consola (una vez por tipo) y un recuadro visible; en producción, nada. */
function SinComponente({ block }: { block: NormalizedBlock }) {
  if (!DEV) return null;
  if (!avisados.has(block.type)) {
    avisados.add(block.type);
    console.warn(`[hermes] bloque sin componente: ${block.type} (id ${block.id}). Sumalo en components/blocks/PageBlocks.tsx.`);
  }
  return (
    <div className="m-4 flex min-h-24 items-center justify-center border-2 border-dashed border-border p-4 text-center text-xs text-muted-fg">
      Bloque sin componente: <code className="mx-1 font-mono">{block.type}</code> (id {block.id}) — sólo se ve en desarrollo
    </div>
  );
}

export function PageBlocks({
  page,
  products = [],
  components,
  hero = true,
}: {
  page: NormalizedPageBlocks;
  /** Los records del `catalog.bySkus` único de la página (lib/content.ts → productsForBlocks). */
  products?: readonly SkuProduct[];
  components?: BlockComponents;
  /** ¿La primera sección de imagen va como hero, debajo del header transparente? */
  hero?: boolean;
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
  const conHero =
    hero && sections[0]?.blocks.length === 1 && sections[0].blocks[0].span.md === 12 && DE_IMAGEN.has(sections[0].blocks[0].type);
  return (
    <div className={styles.paginaDeBloques}>
      {sections.map((s, i) => {
        const esHero = conHero && i === 0;
        return (
          <section
            key={s.index}
            className={`grid grid-cols-12 ${esHero ? styles.hero : ''}`}
            data-hero={esHero ? '' : undefined}
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
        );
      })}
    </div>
  );
}

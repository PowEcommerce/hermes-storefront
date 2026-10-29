import { BlockImage, BlockLink, Overlay, texto, type BlockProps } from './shared';

/** Imagen de fondo con título, subtítulo y uno o dos botones (colores con hover del backoffice). */
export function BannerButtonBlock({ block: b, priority }: BlockProps<'PageBlock::BannerButton'>) {
  return (
    <div className="relative overflow-hidden rounded-brand">
      <BlockLink href={b.href} className="block" label={texto(b.title) ?? undefined}>
        <BlockImage block={b} image={b.image} mobileImage={b.mobile_image} alt={texto(b.title) ?? b.name ?? ''} priority={priority} />
      </BlockLink>
      <Overlay data={b} position={b.content_text_position} />
    </div>
  );
}

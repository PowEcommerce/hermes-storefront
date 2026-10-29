import { BlockImage, BlockLink, color, texto, type BlockProps } from './shared';

/** Imagen (desktop/mobile) con link y título opcional encima. */
export function BannerBlock({ block: b, priority }: BlockProps<'PageBlock::Banner'>) {
  const titulo = texto(b.title);
  return (
    <figure className="space-y-3">
      {titulo && (
        <figcaption className="text-xl font-semibold" style={{ color: color(b.text_color) }}>
          {titulo}
        </figcaption>
      )}
      <BlockLink href={b.href} className="block overflow-hidden rounded-brand" label={titulo ?? undefined}>
        <BlockImage block={b} image={b.image} mobileImage={b.mobile_image} alt={titulo ?? b.name ?? ''} priority={priority} />
      </BlockLink>
    </figure>
  );
}

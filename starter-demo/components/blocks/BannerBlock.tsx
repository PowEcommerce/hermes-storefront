import { BlockImage, BlockLink, color, texto, type BlockProps } from './shared';
import styles from './Blocks.module.css';

/** Imagen (desktop/mobile) a sangre, con link y el título encima (H1 40/500, centrado). */
export function BannerBlock({ block: b, priority }: BlockProps<'PageBlock::Banner'>) {
  const titulo = texto(b.title);
  const mitad = b.span.md <= 6;
  return (
    <figure className={`${styles.banner} ${mitad ? styles.bannerMitad : ''}`}>
      <BlockLink href={b.href} className={styles.bannerLink} label={titulo ?? undefined}>
        <BlockImage
          block={b}
          image={b.image}
          mobileImage={b.mobile_image}
          alt={titulo ?? b.name ?? ''}
          priority={priority}
          className={styles.bannerImagen}
        />
      </BlockLink>
      {titulo && (
        <figcaption className={styles.bannerTitulo} style={{ color: color(b.text_color) ?? '#ffffff' }}>
          {titulo}
        </figcaption>
      )}
    </figure>
  );
}

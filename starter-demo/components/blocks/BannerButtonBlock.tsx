import { BlockImage, BlockLink, Overlay, texto, type BlockProps } from './shared';
import styles from './Blocks.module.css';

/** Imagen a sangre con bajada, título y uno o dos botones (colores con hover del backoffice). */
export function BannerButtonBlock({ block: b, priority }: BlockProps<'PageBlock::BannerButton'>) {
  return (
    <div className={styles.slide}>
      <BlockLink href={b.href} className={styles.bannerLink} label={texto(b.title) ?? undefined}>
        <BlockImage
          block={b}
          image={b.image}
          mobileImage={b.mobile_image}
          alt={texto(b.title) ?? b.name ?? ''}
          priority={priority}
          className={styles.bannerImagen}
        />
      </BlockLink>
      <Overlay data={b} position={b.content_text_position} />
    </div>
  );
}

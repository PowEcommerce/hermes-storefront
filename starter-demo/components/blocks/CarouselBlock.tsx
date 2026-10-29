import { Carousel } from './Carousel';
import { BlockImage, BlockLink, Overlay, texto, type BlockProps, type ConTextos } from './shared';
import styles from './Blocks.module.css';

type Slide = ConTextos & {
  id?: number | null;
  image?: string | null;
  mobile_image?: string | null;
  type?: string;
};

/**
 * Carrusel de banners a sangre (1440×767 en compu, 375×501 en celular, la
 * foto en cover): los slides se dibujan en el servidor y un client component
 * chico (scroll-snap nativo, flechas, puntos y autoplay que se pausa) los
 * mueve. Los slides de video quedan para más adelante.
 */
export function CarouselBlock({ block: b, priority }: BlockProps<'PageBlock::Carousel'>) {
  const slides = ((b.items ?? []) as Slide[]).filter((s) => s.type !== 'PageBlock::Video' && (texto(s.image) || texto(s.mobile_image)));
  if (!slides.length) return null;
  return (
    <Carousel label={b.name ?? 'Carrusel'}>
      {slides.map((s, i) => (
        <div key={s.id ?? i} className={`${styles.slide} ${styles.slideFijo}`}>
          <BlockLink href={s.href} className={styles.bannerLink} label={texto(s.title) ?? undefined}>
            <BlockImage
              image={s.image}
              mobileImage={s.mobile_image}
              alt={texto(s.title) ?? `${b.name ?? 'Banner'} ${i + 1}`}
              priority={priority && i === 0}
              className={styles.slideImagen}
            />
          </BlockLink>
          <Overlay data={s} position={b.content_text_position} />
        </div>
      ))}
    </Carousel>
  );
}

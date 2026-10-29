// Piezas comunes de los bloques: link interno/externo, imagen desktop/mobile,
// colores del backoffice y el texto + botones encima de una imagen.
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { NormalizedBlock, PageBlockType } from '@hermesecommerce/storefront';
import styles from './Blocks.module.css';

/** Un bloque normalizado de un tipo puntual. */
export type BlockOf<T extends PageBlockType> = Extract<NormalizedBlock, { type: T }>;

/** Lo que recibe el componente de un bloque. */
export interface BlockProps<T extends PageBlockType = PageBlockType> {
  block: BlockOf<T>;
  /** El primer bloque de la página: su imagen carga ya (eager + fetchPriority high). */
  priority: boolean;
}

/** `''` y espacios cuentan como ausente (datos sucios del backoffice). */
export const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Sólo colores CSS "inocentes" (#hex, rgb(), nombres, transparent). */
export function color(v: unknown): string | undefined {
  const s = texto(v);
  return s && /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(s) ? s : undefined;
}

const esExterno = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

/** Link de un bloque: <Link> si es de la tienda, <a target=_blank> si sale; sin href, sólo el contenido. */
export function BlockLink({
  href,
  className,
  style,
  children,
  label,
}: {
  href: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  label?: string;
}) {
  if (!href)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  if (esExterno(href))
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} aria-label={label}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={className} style={style} aria-label={label}>
      {children}
    </Link>
  );
}

const medida = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined);

/**
 * Imagen original del CDN de la marca, sin pasar por ningún optimizador (no
 * hay costo de transformación): <picture> con el arte mobile hasta 767px.
 * Si la API manda medidas (`image_width/height`), van al <img> para reservar
 * el alto; si no, el alto se acomoda al cargar.
 */
export function BlockImage({
  block,
  image,
  mobileImage,
  alt,
  priority,
  className = 'block h-auto w-full',
}: {
  block?: Record<string, unknown>;
  image: string | null | undefined;
  mobileImage?: string | null;
  alt: string;
  priority: boolean;
  className?: string;
}) {
  const src = texto(image);
  const mobile = texto(mobileImage);
  const principal = src ?? mobile;
  if (!principal) return null;
  const width = medida(block?.image_width);
  const height = medida(block?.image_height);
  return (
    <picture>
      {mobile && mobile !== src && <source media="(max-width: 767px)" srcSet={mobile} />}
      <img
        src={principal}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={className}
      />
    </picture>
  );
}

/** Los campos de texto + botón que comparten BannerButton y los slides del Carousel. */
export interface ConTextos {
  title?: string | null;
  subtitle?: string | null;
  button_title?: string | null;
  href?: string | null;
  second_button_title?: string | null;
  second_href?: string | null;
  text_color?: string | null;
  text_colorsub?: string | null;
  text_colorbot?: string | null;
  text_colorbotcomp?: string | null;
  text_colorbotcomphover?: string | null;
  text_colorbotcomphovertext?: string | null;
  border_color?: string | null;
  border_colorhover?: string | null;
}

const ALINEACION: Record<string, string> = {
  content_text_left: styles.textosIzquierda,
  content_text_right: styles.textosDerecha,
  content_text_center: '',
};

/** Variables del botón (colores del backoffice, con hover). Sin nada cargado: el botón blanco del kit. */
function estiloBoton(d: ConTextos): CSSProperties {
  const fondo = color(d.text_colorbotcomp);
  const texto = color(d.text_colorbot);
  const borde = color(d.border_color);
  return {
    '--boton-fondo': fondo ?? '#ffffff',
    '--boton-texto': texto ?? '#111111',
    '--boton-borde': borde ?? fondo ?? '#ffffff',
    '--boton-fondo-hover': color(d.text_colorbotcomphover) ?? fondo ?? '#ffffff',
    '--boton-texto-hover': color(d.text_colorbotcomphovertext) ?? texto ?? '#111111',
    '--boton-borde-hover': color(d.border_colorhover) ?? borde ?? fondo ?? '#ffffff',
  } as CSSProperties;
}

/** ¿Tiene algo para mostrar encima de la imagen? */
export const tieneTextos = (d: ConTextos) =>
  Boolean(texto(d.title) || texto(d.subtitle) || texto(d.button_title) || texto(d.second_button_title));

/**
 * Bajada (kicker 20/400), título Display 64/600 y 1–2 botones blancos encima
 * de la imagen, abajo y al centro (o a un costado, si el backoffice lo pide).
 * Un velo suave abajo hace que el texto se lea sobre cualquier foto. El resto
 * del área sigue siendo el link de la imagen.
 */
export function Overlay({ data, position }: { data: ConTextos; position?: string | null }) {
  if (!tieneTextos(data)) return null;
  const titulo = texto(data.title);
  const sub = texto(data.subtitle);
  const boton = texto(data.button_title);
  const boton2 = texto(data.second_button_title);
  return (
    <>
      <span className={styles.velo} aria-hidden="true" />
      <div className={`${styles.textos} ${ALINEACION[position ?? ''] ?? ''}`}>
        {sub && (
          <p className={styles.kicker} style={{ color: color(data.text_colorsub) ?? color(data.text_color) ?? '#ffffff' }}>
            {sub}
          </p>
        )}
        {titulo && (
          <h2 className={styles.tituloHero} style={{ color: color(data.text_color) ?? '#ffffff' }}>
            {titulo}
          </h2>
        )}
        {(boton || boton2) && (
          <div className={styles.botones} style={estiloBoton(data)}>
            {boton && data.href && (
              <BlockLink href={data.href} className={`ui-boton ${styles.boton}`}>
                {boton}
              </BlockLink>
            )}
            {boton2 && data.second_href && (
              <BlockLink href={data.second_href} className={`ui-boton ${styles.boton}`}>
                {boton2}
              </BlockLink>
            )}
          </div>
        )}
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCerrarConEscape } from '@/lib/hooks';
import type { CategoriaDelMenu } from './HeaderBar';
import styles from './MegaMenu.module.css';

/**
 * Mega-menú de compu: panel blanco debajo del header con una tarjeta por
 * categoría raíz (la foto de `dropdown_images` y el nombre) y sus
 * subcategorías. La página de atrás se desenfoca; las tarjetas entran de a
 * una. Se abre con el ícono de menú (click o hover) y se cierra al salir con
 * el mouse, con Escape o al tocar un link.
 */
export function MegaMenu({
  abierto,
  categorias,
  onClose,
}: {
  abierto: boolean;
  categorias: CategoriaDelMenu[];
  onClose: () => void;
}) {
  useCerrarConEscape(abierto, onClose);
  if (!categorias.length) return null;
  const tab = abierto ? 0 : -1;

  return (
    <>
      <div className={`${styles.fondo} ${abierto ? styles.visible : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.panel} ${abierto ? styles.visible : ''}`} onMouseLeave={onClose} aria-hidden={!abierto}>
        <ul className={styles.grilla}>
          {categorias.map((c, i) => (
            <li key={c.id} className={styles.tile} style={{ '--i': i } as CSSProperties}>
              <Link href={`/categoria/${c.slug}`} className={styles.tileLink} tabIndex={tab} onClick={onClose}>
                <span className={styles.foto}>
                  {/* El panel vive en el DOM de todas las páginas: lazy para no competir con la foto principal. */}
                  {c.image && <img src={c.image} alt="" loading="lazy" decoding="async" />}
                </span>
                <span className={styles.nombre}>{c.name}</span>
              </Link>
              {c.children.length > 0 && (
                <ul className={styles.hijas}>
                  {c.children.map((h) => (
                    <li key={h.id || h.slug}>
                      <Link href={`/categoria/${h.slug}`} className={styles.hija} tabIndex={tab} onClick={onClose}>
                        {h.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

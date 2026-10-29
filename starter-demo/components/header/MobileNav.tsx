'use client';

import Link from 'next/link';
import { User, X } from 'lucide-react';
import { useBloquearScroll, useCerrarConEscape } from '@/lib/hooks';
import type { CategoriaDelMenu, MarcaDelHeader } from './HeaderBar';
import styles from './MobileNav.module.css';

/**
 * Menú de celular: pantalla blanca completa que entra desde la derecha, con
 * una tarjeta por categoría raíz (foto + nombre) y al pie el acceso a la
 * cuenta.
 */
export function MobileNav({
  abierto,
  marca,
  categorias,
  onClose,
}: {
  abierto: boolean;
  marca: MarcaDelHeader;
  categorias: CategoriaDelMenu[];
  onClose: () => void;
}) {
  useBloquearScroll(abierto);
  useCerrarConEscape(abierto, onClose);
  const tab = abierto ? 0 : -1;

  return (
    <div className={`${styles.pantalla} ${abierto ? styles.abierta : ''}`} aria-hidden={!abierto} role="dialog" aria-label="Menú">
      <div className={styles.cabecera}>
        <Link href="/" onClick={onClose} className={styles.logo} tabIndex={tab}>
          {marca.logo ? <img src={marca.logo} alt={marca.name} className={styles.logoImagen} /> : marca.name}
        </Link>
        <button type="button" className={styles.cerrar} onClick={onClose} aria-label="Cerrar menú" tabIndex={tab}>
          <X size={22} strokeWidth={1.5} />
        </button>
      </div>

      <nav className={styles.lista} aria-label="Categorías">
        {categorias.map((c) => (
          <div key={c.id} className={styles.grupo}>
            <Link href={`/categoria/${c.slug}`} className={styles.tile} onClick={onClose} tabIndex={tab}>
              {c.image && (
                <span className={styles.foto}>
                  <img src={c.image} alt="" loading="lazy" decoding="async" />
                </span>
              )}
              <span className={styles.nombre}>{c.name}</span>
            </Link>
            {c.children.length > 0 && (
              <ul className={styles.hijas}>
                {c.children.map((h) => (
                  <li key={h.id || h.slug}>
                    <Link href={`/categoria/${h.slug}`} onClick={onClose} tabIndex={tab}>
                      {h.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>

      <Link href="/cuenta" className={styles.pie} onClick={onClose} tabIndex={tab}>
        <User size={24} strokeWidth={1.5} />
        <span>Mi cuenta</span>
      </Link>
    </div>
  );
}

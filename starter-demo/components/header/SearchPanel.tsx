'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useBloquearScroll, useCerrarConEscape } from '@/lib/hooks';
import type { CategoriaDelMenu } from './HeaderBar';
import styles from './SearchPanel.module.css';

/**
 * Buscador: panel que baja desde arriba con el campo (un <form> GET a
 * /buscar, así anda también sin JavaScript) y atajos a las categorías.
 */
export function SearchPanel({
  abierto,
  categorias,
  onClose,
}: {
  abierto: boolean;
  categorias: CategoriaDelMenu[];
  onClose: () => void;
}) {
  useBloquearScroll(abierto);
  useCerrarConEscape(abierto, onClose);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);
  const tab = abierto ? 0 : -1;

  return (
    <>
      <div className={`${styles.velo} ${abierto ? styles.visible : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.panel} ${abierto ? styles.visible : ''}`} role="dialog" aria-label="Buscar" aria-hidden={!abierto}>
        <form action="/buscar" role="search" className={styles.form} onSubmit={() => onClose()}>
          <Search size={24} strokeWidth={1.5} aria-hidden="true" className={styles.lupa} />
          <label htmlFor="buscador" className="ui-solo-lectores">
            Buscar productos
          </label>
          <input
            ref={campo}
            id="buscador"
            name="q"
            type="search"
            placeholder="¿Qué estás buscando?"
            autoComplete="off"
            maxLength={100}
            className={styles.input}
            tabIndex={tab}
          />
          <button type="button" className={styles.cerrar} onClick={onClose} aria-label="Cerrar buscador" tabIndex={tab}>
            <X size={22} strokeWidth={1.5} />
          </button>
        </form>
        {categorias.length > 0 && (
          <div className={styles.atajos}>
            <p className={styles.rotulo}>Categorías</p>
            <ul className={styles.chips}>
              {categorias.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className={styles.chip} onClick={onClose} tabIndex={tab}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

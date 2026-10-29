'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import styles from './Blocks.module.css';

/**
 * Fila de tarjetas con scroll horizontal (scroll-snap) y flechas: el título
 * a la izquierda, las flechas a la derecha y la última tarjeta asomando
 * cortada contra el borde. Las tarjetas llegan dibujadas del servidor.
 */
export function FilaDeProductos({
  titulo,
  extra,
  columna = false,
  children,
}: {
  titulo?: ReactNode;
  /** Algo más en la cabecera (el link "Ver todo"). */
  extra?: ReactNode;
  /** Bloque de media pantalla: una tarjeta por vez, centrada. */
  columna?: boolean;
  children: ReactNode;
}) {
  const pista = useRef<HTMLUListElement>(null);
  const [bordes, setBordes] = useState({ inicio: true, fin: false });

  const medir = useCallback(() => {
    const el = pista.current;
    if (!el) return;
    setBordes({ inicio: el.scrollLeft <= 4, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      el.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [medir]);

  const mover = (sentido: 1 | -1) => {
    const el = pista.current;
    const tarjeta = el?.querySelector('li');
    if (!el || !tarjeta) return;
    el.scrollBy({ left: sentido * (tarjeta.getBoundingClientRect().width + 16) * (columna ? 1 : 2), behavior: 'smooth' });
  };

  return (
    <div className={`${styles.fila} ${columna ? styles.filaColumna : ''}`}>
      <div className={styles.filaCabecera}>
        {titulo}
        <div className={styles.filaAcciones}>
          {extra}
          <button type="button" className={styles.flecha} onClick={() => mover(-1)} disabled={bordes.inicio} aria-label="Anteriores">
            <ArrowLeft size={22} strokeWidth={1.5} />
          </button>
          <button type="button" className={styles.flecha} onClick={() => mover(1)} disabled={bordes.fin} aria-label="Siguientes">
            <ArrowRight size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <ul ref={pista} className={styles.filaPista}>
        {children}
      </ul>
    </div>
  );
}

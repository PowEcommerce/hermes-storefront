'use client';
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './Blocks.module.css';

const INTERVALO_MS = 6000;

/**
 * Carrusel de banners sobre scroll-snap del navegador (sin librerías):
 * flechas, puntos (el activo es un anillo) y autoplay que se pausa con el
 * mouse encima, con el foco adentro, con la pestaña oculta y con "reducir
 * movimiento".
 */
export function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const slides = Children.toArray(children);
  const pista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const total = slides.length;

  const ir = useCallback(
    (i: number) => {
      const el = pista.current;
      if (!el) return;
      const n = (i + total) % total;
      el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    },
    [total],
  );

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const alMover = () => setActual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', alMover, { passive: true });
    return () => el.removeEventListener('scroll', alMover);
  }, []);

  useEffect(() => {
    if (total < 2 || pausa) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      if (!document.hidden) ir(actual + 1);
    }, INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [actual, pausa, total, ir]);

  return (
    <div
      className={styles.carrusel}
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)}
      onBlur={() => setPausa(false)}
    >
      <div ref={pista} className={styles.carruselPista}>
        {slides.map((s, i) => (
          <div
            key={i}
            className={styles.carruselSlide}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${total}`}
            inert={i !== actual}
          >
            {s}
          </div>
        ))}
      </div>
      {total > 1 && (
        <>
          <button type="button" onClick={() => ir(actual - 1)} aria-label="Anterior" className={`${styles.carruselFlecha} ${styles.carruselAnterior}`}>
            <ChevronLeft size={28} strokeWidth={1.25} />
          </button>
          <button type="button" onClick={() => ir(actual + 1)} aria-label="Siguiente" className={`${styles.carruselFlecha} ${styles.carruselSiguiente}`}>
            <ChevronRight size={28} strokeWidth={1.25} />
          </button>
          <div className={styles.puntos}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Ir al ${i + 1}`}
                aria-current={i === actual}
                className={`${styles.punto} ${i === actual ? styles.puntoActivo : ''}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

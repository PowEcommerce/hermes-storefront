'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Producto.module.css';

/**
 * Fotos de la ficha. En compu: grilla de dos columnas con 4 px de calle, cada
 * foto 4:5 sobre el fondo de foto (la primera con prioridad). En celular: un
 * carrusel a todo el ancho con scroll-snap y puntos adentro de la foto.
 */
export function Galeria({ fotos, alt }: { fotos: string[]; alt: string }) {
  const pista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const mover = () => setActual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', mover, { passive: true });
    return () => el.removeEventListener('scroll', mover);
  }, []);

  if (!fotos.length) return <div className={styles.fotoVacia} />;

  return (
    <div className={styles.galeria}>
      <div className={`${styles.grilla} ${fotos.length === 1 ? styles.grillaUna : ''}`}>
        {fotos.map((src, i) => (
          <div key={src} className={styles.pieza}>
            <img src={src} alt={i === 0 ? alt : ''} loading={i < 2 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
          </div>
        ))}
      </div>
      <div className={styles.carrusel}>
        <div ref={pista} className={styles.carruselPista}>
          {fotos.map((src, i) => (
            <div key={src} className={styles.slide}>
              <img src={src} alt={i === 0 ? alt : `${alt} — foto ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
            </div>
          ))}
        </div>
        {fotos.length > 1 && (
          <div className={styles.puntos} aria-hidden="true">
            {fotos.map((src, i) => (
              <span key={src} className={`${styles.punto} ${i === actual ? styles.puntoActivo : ''}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

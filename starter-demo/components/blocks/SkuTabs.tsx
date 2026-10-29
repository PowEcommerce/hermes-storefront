'use client';
import { Children, useId, useState, type ReactNode } from 'react';
import styles from './Blocks.module.css';

/** Solapas del carrusel de SKUs: los paneles vienen ya dibujados del servidor; acá sólo se elige cuál se ve. */
export function SkuTabs({ titulo, labels, children }: { titulo?: ReactNode; labels: string[]; children: ReactNode }) {
  const [activa, setActiva] = useState(0);
  const id = useId();
  const paneles = Children.toArray(children);
  return (
    <div>
      <div className={styles.solapasCabecera}>
        {titulo}
        <div role="tablist" className={styles.solapas}>
          {labels.map((l, i) => (
            <button
              key={l + i}
              type="button"
              role="tab"
              id={`${id}-t${i}`}
              aria-selected={i === activa}
              aria-controls={`${id}-p${i}`}
              onClick={() => setActiva(i)}
              className={`${styles.solapa} ${i === activa ? styles.solapaActiva : ''}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {paneles.map((p, i) => (
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={i !== activa}>
          {p}
        </div>
      ))}
    </div>
  );
}

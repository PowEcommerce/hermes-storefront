'use client';
import { Children, useId, useState, type ReactNode } from 'react';

/** Solapas del carrusel de SKUs: los paneles vienen ya dibujados del servidor; acá sólo se elige cuál se ve. */
export function SkuTabs({ labels, children }: { labels: string[]; children: ReactNode }) {
  const [activa, setActiva] = useState(0);
  const id = useId();
  const paneles = Children.toArray(children);
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-2 overflow-x-auto">
        {labels.map((l, i) => (
          <button
            key={l + i}
            type="button"
            role="tab"
            id={`${id}-t${i}`}
            aria-selected={i === activa}
            aria-controls={`${id}-p${i}`}
            onClick={() => setActiva(i)}
            className={`h-9 whitespace-nowrap rounded-brand border px-4 text-sm ${
              i === activa ? 'border-fg bg-fg text-bg' : 'border-border hover:border-fg'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {paneles.map((p, i) => (
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={i !== activa}>
          {p}
        </div>
      ))}
    </div>
  );
}

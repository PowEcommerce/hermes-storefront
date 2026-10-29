'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Botón "volver arriba": aparece después de scrollear una pantalla. */
export function ScrollTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mirar = () => setVisible(window.scrollY > window.innerHeight);
    mirar();
    window.addEventListener('scroll', mirar, { passive: true });
    return () => window.removeEventListener('scroll', mirar);
  }, []);
  return (
    <button
      type="button"
      aria-label="Volver arriba"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className={`fixed right-4 bottom-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-fg text-bg shadow-lg transition-opacity duration-300 md:right-6 md:bottom-6 ${
        visible ? 'opacity-90 hover:opacity-100' : 'pointer-events-none opacity-0'
      }`}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={20} strokeWidth={1.75} />
    </button>
  );
}

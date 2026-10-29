'use client';

import { useEffect, useState } from 'react';

/** Evento que disparan los componentes que cambian el carrito. */
export const CART_EVENT = 'hermes:cart';

/**
 * Cantidad de unidades en el carrito. Se pide desde el navegador a
 * /api/carrito/resumen (que lee la cookie httpOnly) para no volver dinámico
 * todo el layout: las páginas del catálogo siguen saliendo de la caché.
 */
export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch('/api/carrito/resumen', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d: { count: number }) => vivo && setCount(d.count))
        .catch(() => undefined);
    cargar();
    window.addEventListener(CART_EVENT, cargar);
    return () => {
      vivo = false;
      window.removeEventListener(CART_EVENT, cargar);
    };
  }, []);

  if (!count) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-fg">
      {count}
    </span>
  );
}

'use client';

import { useEffect, useState } from 'react';

/** Evento que disparan los componentes que cambian el carrito. */
export const CART_EVENT = 'hermes:cart';

/**
 * Cantidad de unidades en el carrito. Se pide desde el navegador a
 * /api/carrito/resumen (que lee la cookie httpOnly) para no volver dinámico
 * todo el layout: las páginas del catálogo siguen saliendo de la caché.
 */
export function CartBadge({ className }: { className?: string }) {
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
    <span className={className} aria-label={`${count} ${count === 1 ? 'producto' : 'productos'} en el carrito`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

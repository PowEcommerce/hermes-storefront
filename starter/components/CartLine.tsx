'use client';

import { useState, useTransition } from 'react';
import type { CartLine as Linea } from '@hermesecommerce/storefront';
import { cambiarCantidad } from '@/app/carrito/actions';
import { preciosDeLinea } from '@/lib/precios';
import { CART_EVENT } from './CartBadge';

/** Una línea del carrito con +/− y quitar (Server Actions; la página se re-renderiza sola). */
export function CartLine({ line }: { line: Linea }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const precios = preciosDeLinea(line);

  const cambiar = (qty: number) =>
    start(async () => {
      const r = await cambiarCantidad(line.id, qty);
      setError(r.ok ? '' : r.message);
      window.dispatchEvent(new Event(CART_EVENT));
    });

  return (
    <li className={`flex gap-4 py-4 ${pending ? 'opacity-50' : ''}`}>
      {line.image ? (
        <img src={line.image} alt={line.title ?? ''} className="h-28 w-20 rounded-brand bg-muted object-cover" />
      ) : (
        <div className="h-28 w-20 rounded-brand bg-muted" />
      )}
      <div className="flex flex-1 flex-col gap-1 text-sm">
        <p className="font-medium">{line.title}</p>
        {line.properties.length > 0 && <p className="text-muted-fg">{line.properties.join(' · ')}</p>}
        <div className="mt-auto flex items-center gap-3">
          <div className="flex items-center rounded-brand border border-border">
            <button type="button" aria-label="Restar uno" className="h-8 w-8" disabled={pending} onClick={() => cambiar(line.quantity - 1)}>
              −
            </button>
            <span className="w-8 text-center" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              aria-label="Sumar uno"
              className="h-8 w-8 disabled:opacity-30"
              disabled={pending || line.quantity >= line.stock}
              onClick={() => cambiar(line.quantity + 1)}
            >
              +
            </button>
          </div>
          <button type="button" className="text-muted-fg underline" disabled={pending} onClick={() => cambiar(0)}>
            Quitar
          </button>
        </div>
        {error && <p className="text-danger">{error}</p>}
      </div>
      <div className="text-right text-sm">
        <p className="font-medium">{precios.total}</p>
        {precios.tachado && <p className="text-muted-fg line-through">{precios.tachado}</p>}
      </div>
    </li>
  );
}

'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';
import { agregarAlCarrito, type ResultadoCarrito } from '@/app/carrito/actions';
import type { PrecioVisible } from '@/lib/precios';
import { CART_EVENT } from './CartBadge';

export interface Talle {
  variantId: number;
  /** null = producto sin talles (una sola variante). */
  label: string | null;
  stock: number;
  /** El precio de ESTE talle (en oferta puede serlo sólo uno). Ya formateado en el server. */
  precio: PrecioVisible | null;
}

/**
 * Precio + selector de talle + "Agregar al carrito". El precio vive acá
 * porque depende del talle elegido; `children` (el selector de color, que es
 * server) va entre el precio y los talles.
 */
export function AddToCart({
  talles,
  sinStock,
  precioSinTalle,
  children,
}: {
  talles: Talle[];
  sinStock: boolean;
  /** Antes de elegir talle: el precio común, o "desde" si los talles difieren. */
  precioSinTalle: PrecioVisible | null;
  children?: ReactNode;
}) {
  const unico = talles.length === 1 && talles[0].label === null ? talles[0] : null;
  const [elegido, setElegido] = useState<number | null>(unico?.variantId ?? null);
  const [cantidad, setCantidad] = useState(1);
  const [resultado, setResultado] = useState<ResultadoCarrito | null>(null);
  const [pending, start] = useTransition();

  const talle = talles.find((t) => t.variantId === elegido);
  const tope = Math.max(1, Math.min(talle?.stock ?? 1, 10));

  const agregar = () => {
    if (!elegido) {
      setResultado({ ok: false, message: 'Elegí un talle.' });
      return;
    }
    start(async () => {
      const r = await agregarAlCarrito(elegido, cantidad);
      setResultado(r);
      if (r.ok) window.dispatchEvent(new Event(CART_EVENT));
    });
  };

  const precio = talle?.precio ?? precioSinTalle;
  const bloquePrecio = precio && (
    <p className="text-xl">
      {precio.desde && <span className="mr-1 text-base text-muted-fg">Desde</span>}
      <span className="font-semibold">{precio.texto}</span>
      {precio.tachado && <span className="ml-3 text-base text-muted-fg line-through">{precio.tachado}</span>}
    </p>
  );

  if (sinStock)
    return (
      <div className="space-y-6">
        {bloquePrecio}
        {children}
        <p className="rounded-brand bg-muted p-3 text-sm">Sin stock por ahora.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {bloquePrecio}
      {children}
      <div className="space-y-4">
        {!unico && (
          <fieldset>
            <legend className="mb-2 text-sm">Talle</legend>
            <div className="flex flex-wrap gap-2">
              {talles.map((t) => (
                <button
                  key={t.variantId}
                  type="button"
                  disabled={t.stock <= 0}
                  aria-pressed={t.variantId === elegido}
                  onClick={() => {
                    setElegido(t.variantId);
                    setCantidad(1);
                    setResultado(null);
                  }}
                  className={`h-10 min-w-12 rounded-brand border px-3 text-sm disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${
                    t.variantId === elegido ? 'border-fg bg-fg text-bg' : 'border-border'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {talle && talle.stock > 0 && talle.stock <= 3 && (
              <p className="mt-2 text-sm text-danger">¡Quedan {talle.stock}!</p>
            )}
          </fieldset>
        )}

        <div className="flex gap-3">
          <label className="sr-only" htmlFor="cantidad">
            Cantidad
          </label>
          <select
            id="cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="input h-11 w-20"
          >
            {Array.from({ length: tope }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" className="btn flex-1" onClick={agregar} disabled={pending}>
            {pending ? 'Agregando…' : 'Agregar al carrito'}
          </button>
        </div>

        {resultado && (
          <p role="status" className={`text-sm ${resultado.ok ? 'text-accent' : 'text-danger'}`}>
            {resultado.message}{' '}
            {resultado.ok && (
              <Link href="/carrito" className="underline">
                Ver carrito
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

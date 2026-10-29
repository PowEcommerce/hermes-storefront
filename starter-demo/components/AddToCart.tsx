'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';
import { agregarAlCarrito, type ResultadoCarrito } from '@/app/carrito/actions';
import type { PrecioVisible } from '@/lib/precios';
import { CART_EVENT } from './CartBadge';
import styles from './producto/Producto.module.css';

export interface Talle {
  variantId: number;
  /** null = producto sin talles (una sola variante). */
  label: string | null;
  stock: number;
  /** El precio de ESTE talle (en oferta puede serlo sólo uno). Ya formateado en el server. */
  precio: PrecioVisible | null;
}

/**
 * Nombre + precio (en la misma línea), el selector de color (`children`, que
 * es server), las cajas de talle y «Agregar al carrito». El precio vive acá
 * porque depende del talle elegido. Sin talle elegido, el CTA pide uno y la
 * fila de talles se sacude.
 */
export function AddToCart({
  titulo,
  cucardas = [],
  talles,
  sinStock,
  precioSinTalle,
  children,
}: {
  titulo: string;
  cucardas?: string[];
  talles: Talle[];
  sinStock: boolean;
  /** Antes de elegir talle: el precio común, o "desde" si los talles difieren. */
  precioSinTalle: PrecioVisible | null;
  children?: ReactNode;
}) {
  const unico = talles.length === 1 && talles[0].label === null ? talles[0] : null;
  // Un solo talle con stock ("U", talle único): ya elegido.
  const soloUno = talles.length === 1 && talles[0].stock > 0 ? talles[0] : null;
  const [elegido, setElegido] = useState<number | null>((unico ?? soloUno)?.variantId ?? null);
  const [cantidad, setCantidad] = useState(1);
  const [resultado, setResultado] = useState<ResultadoCarrito | null>(null);
  const [pideTalle, setPideTalle] = useState(0);
  const [pending, start] = useTransition();

  const talle = talles.find((t) => t.variantId === elegido);
  const tope = Math.max(1, Math.min(talle?.stock ?? 1, 10));

  const agregar = () => {
    if (!elegido) {
      setPideTalle((n) => n + 1);
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
  const oferta = Boolean(precio?.tachado);

  return (
    <div className={styles.detalle}>
      {cucardas.length > 0 && (
        <p className={styles.cucardas}>
          {cucardas.map((c, i) => (
            <span key={c} className={i === 0 && c.endsWith('% OFF') ? styles.cucardaOferta : undefined}>
              {c}
            </span>
          ))}
        </p>
      )}
      <div className={styles.cabecera}>
        <h1 className={styles.titulo}>{titulo}</h1>
        {precio && (
          <p className={styles.precio}>
            {precio.desde && <span className={styles.desde}>Desde </span>}
            <span className={oferta ? styles.precioOferta : undefined}>{precio.texto}</span>
            {precio.tachado && (
              <>
                {' '}
                <s className={styles.precioTachado}>{precio.tachado}</s>
              </>
            )}
          </p>
        )}
      </div>

      {children}

      {sinStock ? (
        <p className={styles.sinStock}>Sin stock por ahora.</p>
      ) : (
        <>
          {!unico && (
            <fieldset className={styles.grupo}>
              <legend className={styles.etiqueta}>
                Talle{talle?.label ? <span className={styles.etiquetaValor}>{talle.label}</span> : null}
              </legend>
              <ul key={pideTalle} className={`${styles.talles} ${pideTalle ? styles.sacudida : ''}`}>
                {talles.map((t) => (
                  <li key={t.variantId}>
                    <button
                      type="button"
                      disabled={t.stock <= 0}
                      aria-pressed={t.variantId === elegido}
                      onClick={() => {
                        setElegido(t.variantId);
                        setCantidad(1);
                        setResultado(null);
                      }}
                      className={`${styles.talle} ${t.variantId === elegido ? styles.talleActivo : ''}`}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
              {talle && talle.stock > 0 && talle.stock <= 3 && <p className={styles.quedan}>¡Quedan {talle.stock}!</p>}
            </fieldset>
          )}

          <div className={styles.compra}>
            <label className="ui-solo-lectores" htmlFor="cantidad">
              Cantidad
            </label>
            <select id="cantidad" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={styles.cantidad}>
              {Array.from({ length: tope }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`ui-boton ${styles.cta} ${!elegido ? styles.ctaPideTalle : ''}`}
              onClick={agregar}
              disabled={pending}
            >
              {pending ? 'Agregando…' : elegido ? 'Agregar al carrito' : 'Elegí tu talle'}
            </button>
          </div>

          {resultado && (
            <p role="status" className={resultado.ok ? styles.ok : styles.error}>
              {resultado.message}{' '}
              {resultado.ok && (
                <Link href="/carrito" className="ui-enlace">
                  Ver carrito
                </Link>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

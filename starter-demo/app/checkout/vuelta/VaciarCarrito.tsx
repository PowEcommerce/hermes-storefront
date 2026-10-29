'use client';

import { useEffect } from 'react';
import { vaciarCarritoLocal } from '@/app/carrito/actions';
import { CART_EVENT } from '@/components/CartBadge';

/** La compra terminó: el carrito ya es una orden, sacamos la cookie. */
export function VaciarCarrito() {
  useEffect(() => {
    vaciarCarritoLocal().then(() => window.dispatchEvent(new Event(CART_EVENT)));
  }, []);
  return null;
}

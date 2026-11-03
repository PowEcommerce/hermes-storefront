'use client';

import { useEffect } from 'react';
import { trackSearchPurchase } from '@hermesecommerce/storefront/search';

/**
 * La compra terminó (estado leído server-side): manda `purchase-complete` por
 * los productos que se agregaron al carrito desde el buscador inteligente.
 * Sin ninguno (o sin la app), no hace nada. Recargar no duplica (por order_id).
 */
export function MedirCompra({ orderId }: { orderId: number }) {
  useEffect(() => {
    trackSearchPurchase({ order_id: orderId });
  }, [orderId]);
  return null;
}

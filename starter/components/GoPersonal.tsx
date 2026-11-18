'use client';

// Go Personal en el navegador. <GoPersonal> va una vez en el layout (sólo con
// la app prendida): carga el SDK después de montar (no bloquea el render) y en
// cada navegación pide el contenido de la página (home, categorías, búsqueda,
// checkout) y aplica el login/logout que dejó el servidor. La PDP y el
// carrito mandan su propio contexto con <GoPersonalProducto> y
// <GoPersonalCarrito>. La intención de salida la maneja el SDK solo (pop-ups
// configurados en Go Personal). Sin la app, los track* no mandan nada.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  consumeGoPersonalIdentity,
  goPersonalContextFor,
  goPersonalPage,
  loadGoPersonal,
  trackGoPersonalCart,
  trackGoPersonalProductView,
  type GoPersonalCartLine,
} from '@hermesecommerce/storefront/gopersonal';

export function GoPersonal({ clientId }: { clientId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    loadGoPersonal(clientId);
  }, [clientId]);

  useEffect(() => {
    consumeGoPersonalIdentity();
    goPersonalPage(goPersonalContextFor(pathname));
  }, [pathname]);

  return null;
}

/** En la PDP: el contenido de la PDP y la vista del producto. */
export function GoPersonalProducto({ productId }: { productId: number | string }) {
  useEffect(() => {
    trackGoPersonalProductView(productId);
  }, [productId]);
  return null;
}

/** En el carrito: el contenido de la página `cart` y el estado del carrito (vacío = clean-cart). */
export function GoPersonalCarrito({ lineas }: { lineas: GoPersonalCartLine[] }) {
  // Se re-manda cuando cambian las líneas (la página se re-renderiza después de cada cambio).
  const clave = JSON.stringify(lineas);
  useEffect(() => {
    trackGoPersonalCart(JSON.parse(clave) as GoPersonalCartLine[]);
  }, [clave]);
  return null;
}

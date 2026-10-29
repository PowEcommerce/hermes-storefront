// Precios: un solo formato para toda la tienda (PDP, tarjetas, carrito y
// totales), siempre a partir de los NÚMEROS que manda la API.
//
// Los textos ya formateados (`price`, `special_price`…) no son confiables
// para mostrar: algunas marcas los reciben con el formato de su tienda
// anterior ("$ 31,999" en la ficha y "$ 31.999" en el listado). Por eso acá
// se usan `non_formatted_price` / `non_formatted_special_price`, `*_cents`,
// etc., y el texto sólo como último recurso.
//
// Sin imports: se usa igual en server y client components y en los tests.

const SIN_DECIMALES = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const CON_DECIMALES = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `31999` → "$ 31.999"; `45999.9` → "$ 45.999,90" (decimales sólo si los hay). */
export function formatearPrecio(pesos: number): string {
  const redondo = Math.round(pesos * 100) / 100;
  return (Number.isInteger(redondo) ? SIN_DECIMALES : CON_DECIMALES).format(redondo);
}

/** Centavos (`subtotal_cents`, `total_cents`…) → texto. */
export const formatearCentavos = (centavos: number) => formatearPrecio(centavos / 100);

/**
 * Un monto que viene como número o, en el peor caso, como texto formateado
 * ("$ 35,000", "$ 35.000", "$ 45.999,90", "35000"). En texto, un separador
 * seguido de exactamente 3 dígitos es de miles; de 1 o 2, decimal.
 */
export function aPesos(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(limpio)) return null;
  const ultimo = Math.max(limpio.lastIndexOf('.'), limpio.lastIndexOf(','));
  let entero = limpio;
  let decimales = '';
  if (ultimo >= 0) {
    const cola = limpio.slice(ultimo + 1);
    if (cola.length > 0 && cola.length <= 2) {
      entero = limpio.slice(0, ultimo);
      decimales = cola;
    }
  }
  const n = Number(`${entero.replace(/[.,]/g, '')}${decimales ? `.${decimales}` : ''}`);
  return Number.isFinite(n) ? n : null;
}

/** El precio de una variante: lo que se paga y, si hay oferta vigente, el de lista. */
export interface Precio {
  actual: number;
  lista: number | null;
}

/** Lo mínimo de una variante con precio (ficha, change_variant, update_variant, listado). */
export interface ConPrecio {
  price?: unknown;
  special_price?: unknown;
  has_special_price?: boolean | null;
  non_formatted_price?: unknown;
  non_formatted_special_price?: unknown;
}

/** Precio de una variante de la API (`has_special_price` manda; números antes que textos). */
export function precioDe(v: ConPrecio | null | undefined): Precio | null {
  if (!v) return null;
  const lista = aPesos(v.non_formatted_price) ?? aPesos(v.price);
  const especial = aPesos(v.non_formatted_special_price) ?? aPesos(v.special_price);
  if (v.has_special_price && especial !== null && especial > 0 && (lista === null || especial < lista))
    return { actual: especial, lista };
  return lista === null ? null : { actual: lista, lista: null };
}

/** Lo que se muestra: el precio, el tachado (si hay) y si es un "desde". */
export interface PrecioVisible {
  texto: string;
  tachado: string | null;
  desde: boolean;
}

export function precioVisible(p: Precio): PrecioVisible {
  return {
    texto: formatearPrecio(p.actual),
    tachado: p.lista !== null && p.lista > p.actual ? formatearPrecio(p.lista) : null,
    desde: false,
  };
}

/**
 * El precio de la ficha antes de elegir talle, a partir del precio de cada
 * talle (se miran los que tienen stock; si ninguno tiene, todos):
 *
 *  - todos valen lo mismo → ese precio (con su tachado, si lo tiene);
 *  - difieren → "desde" el más barato, tachado sólo si TODOS están en oferta.
 */
export function precioSinTalle(talles: { precio: Precio | null; stock: number }[]): PrecioVisible | null {
  const conPrecio = talles.filter((t): t is { precio: Precio; stock: number } => t.precio !== null);
  const conStock = conPrecio.filter((t) => t.stock > 0);
  const precios = (conStock.length ? conStock : conPrecio).map((t) => t.precio);
  if (!precios.length) return null;
  const [primero] = precios;
  if (precios.every((p) => p.actual === primero.actual && p.lista === primero.lista)) return precioVisible(primero);
  const masBarato = precios.reduce((a, b) => (b.actual < a.actual ? b : a));
  const todosEnOferta = precios.every((p) => p.lista !== null && p.lista > p.actual);
  return {
    texto: formatearPrecio(masBarato.actual),
    tachado: todosEnOferta && masBarato.lista !== null ? formatearPrecio(masBarato.lista) : null,
    desde: true,
  };
}

/** Lo que se usa de una línea del carrito (`CartLine` del SDK). */
export interface LineaConPrecio {
  quantity: number;
  price: string;
  has_special_price: boolean;
  regular_price: string | null;
  ga4_item?: { price?: number } | null;
}

/**
 * Total de la línea y su tachado. El total sale del precio unitario numérico
 * (`ga4_item.price`, sin el cupón prorrateado, igual que `price`) × cantidad;
 * `regular_price` es el precio de lista UNITARIO, así que el tachado también
 * se multiplica por la cantidad para que sea comparable con el total.
 */
export function preciosDeLinea(l: LineaConPrecio): { total: string; tachado: string | null } {
  const unitario = typeof l.ga4_item?.price === 'number' ? l.ga4_item.price : null;
  const total = unitario !== null ? unitario * l.quantity : aPesos(l.price);
  const listaUnitario = l.has_special_price ? aPesos(l.regular_price) : null;
  const tachado = listaUnitario !== null ? listaUnitario * l.quantity : null;
  return {
    total: total !== null ? formatearPrecio(total) : l.price,
    tachado: tachado !== null && (total === null || tachado > total) ? formatearPrecio(tachado) : null,
  };
}

/** Un monto que la API manda SÓLO como texto (`free_amount`, total de un pedido): al formato de la tienda. */
export function normalizarMonto(texto: string): string {
  const n = aPesos(texto);
  return n === null ? texto : formatearPrecio(n);
}

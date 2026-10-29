import { describe, expect, it } from 'vitest';
import {
  aPesos,
  formatearCentavos,
  formatearPrecio,
  normalizarMonto,
  precioDe,
  precioSinTalle,
  preciosDeLinea,
  type Precio,
} from '../lib/precios';

// Intl separa "$" del número con un espacio duro (U+00A0).
const sinNbsp = (s: string | null) => s?.replace(/ /g, ' ') ?? null;

describe('formatearPrecio', () => {
  it('es-AR: punto de miles, sin decimales si el monto es entero', () => {
    expect(sinNbsp(formatearPrecio(31999))).toBe('$ 31.999');
    expect(sinNbsp(formatearPrecio(1500000))).toBe('$ 1.500.000');
    expect(sinNbsp(formatearPrecio(0))).toBe('$ 0');
  });
  it('con decimales, siempre 2', () => {
    expect(sinNbsp(formatearPrecio(45999.9))).toBe('$ 45.999,90');
    expect(sinNbsp(formatearPrecio(26445.45))).toBe('$ 26.445,45');
  });
  it('centavos', () => {
    expect(sinNbsp(formatearCentavos(3199900))).toBe('$ 31.999');
    expect(sinNbsp(formatearCentavos(4599990))).toBe('$ 45.999,90');
  });
});

describe('aPesos (último recurso: texto formateado)', () => {
  it.each([
    [35000, 35000],
    ['$ 35,000', 35000], // coma de miles
    ['$ 35.000', 35000],
    ['$ 45.999,90', 45999.9],
    ['$ 45,999.90', 45999.9],
    ['$ 1.500.000', 1500000],
    ['$9.000', 9000],
    ['35000', 35000],
    ['$ 0', 0],
  ])('%j → %j', (entrada, salida) => expect(aPesos(entrada)).toBe(salida));
  it('sin número → null', () => {
    expect(aPesos('$ ')).toBeNull();
    expect(aPesos(null)).toBeNull();
    expect(aPesos(Number.NaN)).toBeNull();
  });
  it('normalizarMonto pasa cualquier formato al de la tienda', () => {
    expect(sinNbsp(normalizarMonto('$ 9,000'))).toBe('$ 9.000');
    expect(normalizarMonto('Gratis')).toBe('Gratis');
  });
});

describe('precioDe', () => {
  it('usa los números aunque el texto venga con coma de miles', () => {
    expect(
      precioDe({
        price: '$ 35,000',
        non_formatted_price: 35000,
        special_price: '$ 31,999',
        non_formatted_special_price: 31999,
        has_special_price: true,
      }),
    ).toEqual({ actual: 31999, lista: 35000 });
  });
  it('sin oferta vigente: el de lista', () => {
    expect(
      precioDe({
        non_formatted_price: 35000,
        non_formatted_special_price: 0,
        special_price: '$ 0',
        has_special_price: false,
      }),
    ).toEqual({ actual: 35000, lista: null });
  });
  it('un especial >= lista no es oferta', () => {
    expect(precioDe({ non_formatted_price: 100, non_formatted_special_price: 120, has_special_price: true })).toEqual({
      actual: 100,
      lista: null,
    });
  });
  it('sin números cae al texto', () => {
    expect(precioDe({ price: '$ 11.000', special_price: '$ 9.000', has_special_price: true })).toEqual({
      actual: 9000,
      lista: 11000,
    });
  });
  it('null', () => expect(precioDe(null)).toBeNull());
});

describe('precioSinTalle (precio de la ficha antes de elegir talle)', () => {
  const oferta: Precio = { actual: 31999, lista: 35000 };
  const lista: Precio = { actual: 35000, lista: null };

  it('Remera POW NEGRO: S en oferta, M/L/XL a lista → "desde" sin tachado', () => {
    const r = precioSinTalle([
      { precio: oferta, stock: 10 },
      { precio: lista, stock: 10 },
      { precio: lista, stock: 10 },
      { precio: lista, stock: 0 },
    ]);
    expect(r && { ...r, texto: sinNbsp(r.texto) }).toEqual({ texto: '$ 31.999', tachado: null, desde: true });
  });

  it('todos iguales → ese precio, con su tachado', () => {
    const r = precioSinTalle([
      { precio: oferta, stock: 1 },
      { precio: oferta, stock: 1 },
    ]);
    expect(r && { texto: sinNbsp(r.texto), tachado: sinNbsp(r.tachado), desde: r.desde }).toEqual({
      texto: '$ 31.999',
      tachado: '$ 35.000',
      desde: false,
    });
  });

  it('difieren pero TODOS en oferta → "desde" con el tachado del más barato', () => {
    const r = precioSinTalle([
      { precio: { actual: 30000, lista: 40000 }, stock: 1 },
      { precio: { actual: 32000, lista: 40000 }, stock: 1 },
    ]);
    expect(r && { texto: sinNbsp(r.texto), tachado: sinNbsp(r.tachado), desde: r.desde }).toEqual({
      texto: '$ 30.000',
      tachado: '$ 40.000',
      desde: true,
    });
  });

  it('sólo cuenta los talles con stock (si hay alguno)', () => {
    const r = precioSinTalle([
      { precio: oferta, stock: 0 },
      { precio: lista, stock: 5 },
    ]);
    expect(r && { texto: sinNbsp(r.texto), tachado: r.tachado, desde: r.desde }).toEqual({
      texto: '$ 35.000',
      tachado: null,
      desde: false,
    });
  });

  it('sin precios → null', () => {
    expect(precioSinTalle([])).toBeNull();
    expect(precioSinTalle([{ precio: null, stock: 3 }])).toBeNull();
  });
});

describe('preciosDeLinea (carrito)', () => {
  it('total = unitario numérico × cantidad; tachado = lista unitaria × cantidad', () => {
    const r = preciosDeLinea({
      quantity: 2,
      price: '$ 63,998',
      has_special_price: true,
      regular_price: '$ 35,000',
      ga4_item: { price: 31999 },
    });
    expect({ total: sinNbsp(r.total), tachado: sinNbsp(r.tachado) }).toEqual({
      total: '$ 63.998',
      tachado: '$ 70.000',
    });
  });
  it('sin oferta no hay tachado', () => {
    const r = preciosDeLinea({
      quantity: 1,
      price: '$ 35.000',
      has_special_price: false,
      regular_price: null,
      ga4_item: { price: 35000 },
    });
    expect({ total: sinNbsp(r.total), tachado: r.tachado }).toEqual({ total: '$ 35.000', tachado: null });
  });
});

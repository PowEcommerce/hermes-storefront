import { describe, expect, it } from 'vitest';
import { cardFromListado, cardFromRelacionado, cucardasDe } from '../lib/catalog';
import { rutaDeEstatica } from '../lib/estaticas';
import { formatearPrecio } from '../lib/precios';

describe('cucardas de la tarjeta', () => {
  it('lee los flags en sus distintos formatos y no repite', () => {
    expect(cucardasDe({ new: true, sale: 'true', cus_cuc: 1, cus_cuc_text: ' Envío gratis ', cus_cuc_dos: false, cus_cuc_dos_text: 'X' })).toEqual([
      'Nuevo',
      'Sale',
      'Envío gratis',
    ]);
    expect(cucardasDe({ is_new: true, new: true })).toEqual(['Nuevo']);
    expect(cucardasDe({ cus_cuc: true, cus_cuc_text: '' })).toEqual([]);
  });

  it('calcula el % OFF sólo con oferta vigente', () => {
    const base = { id: 1, slug: 'remera', title: 'Remera', image_url: null };
    const oferta = cardFromListado({
      ...base,
      variant: { id: 9, non_formatted_price: 10000, non_formatted_special_price: 7500, has_special_price: true },
    });
    expect(oferta.discount).toBe(25);
    expect(oferta.compareAt).not.toBeNull();
    const lista = cardFromListado({ ...base, variant: { id: 9, non_formatted_price: 10000, non_formatted_special_price: 7500, has_special_price: false } });
    expect(lista.discount).toBeNull();
    expect(lista.compareAt).toBeNull();
  });
});

describe('relacionados', () => {
  it('arma la tarjeta y descarta los que no tienen slug o título', () => {
    expect(cardFromRelacionado({ id: 3, slug: null, title: 'x' })).toBeNull();
    const c = cardFromRelacionado({ id: 3, slug: 'buzo', title: 'Buzo', non_formatted_price: 5000, has_special_price: false, is_new: true } as never);
    expect(c).toMatchObject({ key: 'rel-3', slug: 'buzo', price: formatearPrecio(5000), badges: ['Nuevo'] });
  });
});

describe('estáticas', () => {
  it('arma /info/<path> sin barras sobrantes y escapado', () => {
    expect(rutaDeEstatica('/terminos-y-condiciones/')).toBe('/info/terminos-y-condiciones');
    expect(rutaDeEstatica('ayuda/envios')).toBe('/info/ayuda%2Fenvios');
  });
});

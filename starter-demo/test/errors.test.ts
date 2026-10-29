import { describe, expect, it } from 'vitest';
import { HermesApiError } from '@hermesecommerce/storefront';
import { mensajeDeError, mensajeDeErrorDeUrl } from '../lib/errors';

const err = (status: number, message: string) =>
  new HermesApiError({ status, message, request: { method: 'POST', path: '/api/v2/cart/items' } });

describe('mensajeDeError', () => {
  it('el mensaje de la API si es mostrable', () => {
    expect(mensajeDeError(err(422, 'El cupón venció'), 'x')).toBe('El cupón venció');
  });
  it('HTML, mensajes técnicos o 5xx → el mensaje por defecto', () => {
    expect(mensajeDeError(err(403, '<html><body>Request blocked</body></html>'), 'Probá de nuevo')).toBe(
      'Probá de nuevo',
    );
    expect(mensajeDeError(err(403, 'HTTP 403 en POST /api/v2/cart/items'), 'Probá de nuevo')).toBe('Probá de nuevo');
    expect(mensajeDeError(err(502, 'Bad gateway'), 'Probá de nuevo')).toBe('Probá de nuevo');
  });
});

describe('mensajeDeErrorDeUrl', () => {
  it('traduce sólo códigos conocidos', () => {
    expect(mensajeDeErrorDeUrl('checkout')).toBe('No pudimos iniciar el checkout. Probá de nuevo en unos minutos.');
    expect(mensajeDeErrorDeUrl('<script>alert(1)</script>')).toBeNull();
    expect(mensajeDeErrorDeUrl('toString')).toBeNull();
    expect(mensajeDeErrorDeUrl(['checkout'])).toBeNull();
  });
});

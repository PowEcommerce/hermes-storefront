import { afterEach, describe, expect, it } from 'vitest';
import { createStorefrontClient, HermesApiError } from '../src';
import { fetchFalso, PSK, PST } from './helpers';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const GIRO = { ok: true, prize: { id: 1, position: 2, label: '10%' } };
const CUERPO = { email: 'a@b.com', device: 'mobile', path: '/' };

describe('roulette.spin', () => {
  it('con privado: X-Storefront-Private-Token + X-Visitor-IP, sin el público', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: GIRO }));
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    const r = await pow.roulette.spin(CUERPO, { visitorIp: ' 190.1.2.3 ' });
    expect(r).toEqual(GIRO);
    expect(llamadas).toHaveLength(1);
    const l = llamadas[0];
    expect(l.method).toBe('POST');
    expect(l.url).toBe('https://api.pow.la/api/v2/storefront/roulette/spin');
    expect(l.headers['x-storefront-private-token']).toBe(PSK);
    expect(l.headers['x-storefront-token']).toBeUndefined();
    expect(l.headers['x-visitor-ip']).toBe('190.1.2.3');
    expect(l.body).toEqual(CUERPO);
  });

  it('sin privado: va con el público y SIN X-Visitor-IP (la API la ignoraría)', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: GIRO }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await pow.roulette.spin(CUERPO, { visitorIp: '190.1.2.3' });
    expect(llamadas[0].headers['x-storefront-token']).toBe(PST);
    expect(llamadas[0].headers['x-storefront-private-token']).toBeUndefined();
    expect(llamadas[0].headers['x-visitor-ip']).toBeUndefined();
  });

  it('con privado y sin IP (o una que no es IP): no manda X-Visitor-IP', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: GIRO }));
    const pow = createStorefrontClient({ privateToken: PSK, fetch });
    await pow.roulette.spin(CUERPO);
    await pow.roulette.spin(CUERPO, { visitorIp: '1.2.3.4, 5.6.7.8' });
    for (const l of llamadas) {
      expect(l.headers['x-storefront-private-token']).toBe(PSK);
      expect(l.headers['x-visitor-ip']).toBeUndefined();
    }
  });

  it('privado revocado (401): reintenta UNA vez con el público', async () => {
    const { fetch, llamadas } = fetchFalso((l) =>
      l.headers['x-storefront-private-token']
        ? { status: 401, body: { error: 'Token de storefront inválido o revocado' } }
        : { body: GIRO },
    );
    const pow = createStorefrontClient({
      tenant: 'mimarca',
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    expect(await pow.roulette.spin(CUERPO, { visitorIp: '190.1.2.3' })).toEqual(GIRO);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].headers['x-storefront-token']).toBe(PST);
    expect(llamadas[1].headers['x-storefront-private-token']).toBeUndefined();
    expect(llamadas[1].headers['x-visitor-ip']).toBeUndefined();
  });

  it('otros errores del privado (429) no se reintentan', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      status: 429,
      body: { error: 'Demasiados pedidos' },
    }));
    const pow = createStorefrontClient({
      publicToken: PST,
      privateToken: PSK,
      fetch,
    });
    await expect(pow.roulette.spin(CUERPO)).rejects.toBeInstanceOf(HermesApiError);
    expect(llamadas).toHaveLength(1);
  });
});

describe('roulette.config / view', () => {
  it('config: GET público con los tags de settings', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({
      body: { installed: true, enabled: false },
    }));
    const pow = createStorefrontClient({ publicToken: PST, privateToken: PSK, fetch });
    expect(await pow.roulette.config()).toEqual({ installed: true, enabled: false });
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/storefront/roulette');
    expect(llamadas[0].headers['x-storefront-private-token']).toBeUndefined();
    expect(pow.roulette.config.cacheTags()).toContain('settings');
  });

  it('view: POST con el cuerpo (o {}) y devuelve undefined', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ status: 200 }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    expect(await pow.roulette.view({ device: 'desktop' })).toBeUndefined();
    await pow.roulette.view();
    expect(llamadas[0].url).toBe('https://api.pow.la/api/v2/storefront/roulette/views');
    expect(llamadas[0].body).toEqual({ device: 'desktop' });
    expect(llamadas[1].body).toEqual({});
  });

  it('view: nunca tira (telemetría)', async () => {
    const { fetch } = fetchFalso(() => ({ status: 500, body: { error: 'x' } }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });
    await expect(pow.roulette.view()).resolves.toBeUndefined();
  });
});

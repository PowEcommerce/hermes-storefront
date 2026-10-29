import { describe, expect, expectTypeOf, it } from 'vitest';
import { createStorefrontClient, type Schema } from '../src';
import { fetchFalso, PST } from './helpers';

describe('cliente tipado genérico (tipos)', () => {
  it('infiere respuesta, path y query desde la spec', async () => {
    const { fetch, llamadas } = fetchFalso(() => ({ body: {} }));
    const pow = createStorefrontClient({ publicToken: PST, fetch });

    const footer = await pow.api.GET('/api/v2/settings/footer');
    expectTypeOf(footer.data).toEqualTypeOf<Schema<'SettingsFooter'>>();

    const s = await pow.api
      .GET('/api/v2/checkout_sessions/{id}', { path: { id: 'cs_1' } })
      .catch(() => ({ data: null as never }));
    expectTypeOf(s.data).toEqualTypeOf<Schema<'CheckoutSession'>>();

    await pow.api.GET('/api/v2/search', {
      query: { q: 'remera', sort: 'price_asc' },
    });
    await pow.api.POST('/api/v2/checkout/payment/offline', {
      body: {} as Schema<'PagoOffline'>,
      headers: { 'X-Cart-Token': 'crt_1', 'X-Idempotency-Key': 'k1' },
    });
    // @ts-expect-error: el path no existe en la spec
    await pow.api.GET('/api/v2/no-existe').catch(() => null);

    expect(llamadas.map((l) => l.url)).toContain(
      'https://api.pow.la/api/v2/search?q=remera&sort=price_asc',
    );
    expect(llamadas[3].headers['x-idempotency-key']).toBe('k1');
  });
});

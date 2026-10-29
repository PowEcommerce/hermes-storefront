/**
 * Smoke contra la API real. Se saltea salvo `STOREFRONT_SMOKE=1`.
 *
 *   STOREFRONT_SMOKE=1 HERMES_SMOKE_TENANT=tu-marca HERMES_SMOKE_PST=pst_… npm run test:smoke
 *
 * Sólo GET (config y productos). Variables: HERMES_SMOKE_API_URL (default
 * https://api.pow.la), HERMES_SMOKE_TENANT y/o HERMES_SMOKE_PST (al menos uno).
 */
import { describe, expect, it } from 'vitest';
import { createStorefrontClient } from '../src';

const activo = process.env.STOREFRONT_SMOKE === '1';

describe.skipIf(!activo)('smoke contra la API (sólo GET)', () => {
  const pow = () =>
    createStorefrontClient({
      apiUrl: process.env.HERMES_SMOKE_API_URL ?? 'https://api.pow.la',
      tenant: process.env.HERMES_SMOKE_TENANT || undefined,
      publicToken: process.env.HERMES_SMOKE_PST || undefined,
    });

  it('config', async () => {
    const c = await pow().config.get();
    expect(Array.isArray(c.nest)).toBe(true);
  }, 20_000);

  it('productos', async () => {
    const l = await pow().catalog.products({ page_number: 1 });
    expect(l).toHaveProperty('items');
  }, 20_000);
});

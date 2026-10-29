// Prueba mínima del paquete BUILDEADO (dist/), ESM y CJS, sin tooling de
// test: la corre CI en Node 18 (el piso que soporta el SDK en runtime).
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const esm = await import('../dist/index.js');
const cjs = require('../dist/index.cjs');

for (const [nombre, sdk] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const llamadas = [];
  const pow = sdk.createStorefrontClient({
    tenant: 'mimarca',
    publicToken: 'pst_' + 'a'.repeat(40),
    fetch: async (url, init) => {
      llamadas.push({ url, headers: new Headers(init.headers) });
      return new Response('{"nest":[]}', { status: 200 });
    },
  });
  assert.deepEqual(await pow.config.get(), { nest: [] });
  assert.equal(llamadas[0].url, 'https://api.pow.la/api/v2/storefront/config');
  assert.equal(llamadas[0].headers.get('x-storefront-token'), 'pst_' + 'a'.repeat(40));
  // Sin User-Agent el WAF de api.pow.la da 403 (fetch de Workers no manda uno).
  assert.match(llamadas[0].headers.get('user-agent') ?? '', /^hermes-storefront\/\d+\.\d+\.\d+/);

  const raw = JSON.stringify({ event: 'webhook/test', id: '1', timestamp: new Date().toISOString() });
  const firma = 'sha256=' + createHmac('sha256', 'whsec_x').update(raw).digest('hex');
  const ok = await sdk.verifyWebhook({ rawBody: raw, signatureHeader: firma, secret: 'whsec_x' });
  assert.equal(ok.ok, true, `${nombre}: firma válida`);
  const mala = await sdk.verifyWebhook({ rawBody: raw, signatureHeader: firma, secret: 'whsec_y' });
  assert.equal(mala.ok, false, `${nombre}: firma mala`);
  assert.deepEqual(sdk.cacheTagsFor('Pdp_show', { id: 'remera' }), ['product', 'product-remera']);
  const rv = JSON.stringify({
    event: 'storefront/revalidate',
    id: 'rv_1',
    timestamp: new Date().toISOString(),
    tags: [{ tag: 'settings', mode: 'soft' }],
  });
  const purgados = [];
  const r = await sdk.handleRevalidateWebhook({
    rawBody: rv,
    signatureHeader: 'sha256=' + createHmac('sha256', 'whsec_x').update(rv).digest('hex'),
    secret: 'whsec_x',
    onTags: (tags) => purgados.push(...tags),
  });
  assert.equal(r.status, 200, `${nombre}: revalidate`);
  assert.deepEqual(purgados, [{ tag: 'settings', mode: 'soft' }]);
  console.log(`${nombre}: OK (node ${process.version})`);
}

// El subpath /next importa `next/cache` sin empaquetarlo (peer opcional).
import { readFileSync } from 'node:fs';
for (const f of ['../dist/next.js', '../dist/next.cjs']) {
  const codigo = readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.match(codigo, /["']next\/cache["']/, `${f}: next/cache externo`);
}
console.log('next: next/cache queda externo');

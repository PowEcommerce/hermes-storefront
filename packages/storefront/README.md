# @hermesecommerce/storefront

SDK TypeScript de la **Storefront API v2 de Pow/Hermes** para construir
storefronts headless (estilo `@shopify/storefront-api-client`): catálogo,
carrito, cuenta del comprador, checkout hosteado, reseñas y webhooks.

- Cero dependencias en runtime: `fetch` y WebCrypto nativos. Anda en Node 18+,
  Cloudflare Workers, Vercel Edge, Deno, Bun y el navegador.
- Caché por tags con purga por webhook (`storefront/revalidate`), y un
  subpath `@hermesecommerce/storefront/next` que lo deja andando en Next.js (Next es
  peerDependency **opcional**: el core no lo necesita).
- ESM + CJS + `.d.ts`.
- Tipos generados desde la OpenAPI 3.1 ([`openapi.yaml`](https://github.com/PowEcommerce/hermes-storefront/blob/main/packages/storefront/openapi.yaml))
  con `openapi-typescript`, más métodos agrupados y tipados a mano encima.
- Referencia completa de la API: [guía para agencias](https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/guia-agencias.md)
  y `GET https://api.pow.la/api/v2/openapi.json`.

## Instalación

```bash
npm i @hermesecommerce/storefront
```

## Quickstart

El mismo flujo de la guía: config → productos → carrito → checkout hosteado →
webhook.

```ts
import { createStorefrontClient, verifyWebhook, isHermesApiError } from '@hermesecommerce/storefront';

// En tu SERVIDOR (SSR, route handler, BFF). El psk_ nunca va al navegador.
// Las variables HERMES_* las escribe `hermes link` (CLI @hermesecommerce/cli).
const pow = createStorefrontClient({
  tenant: process.env.HERMES_TENANT,               // X-Client-ID (p. ej. 'tu-marca')
  publicToken: process.env.HERMES_PUBLIC_TOKEN!,   // pst_… → X-Storefront-Token
  privateToken: process.env.HERMES_PRIVATE_TOKEN,  // psk_… → X-Storefront-Private-Token (opcional)
  apiUrl: process.env.HERMES_API_URL,              // con o sin /api; default https://api.pow.la
});

// 1. Config de la marca (cacheala unos minutos)
const config = await pow.config.get();

// 2. Listado y ficha
const { items, total, items_per_page } = await pow.catalog.products({ page_number: 1, price: '1' });
const remeras = await pow.catalog.products({ category: 'remeras', multisizes: ['S', 'M'] });
const ficha = await pow.catalog.product('remera-basica');

// 3. Carrito: el primer addLine (sin token) lo crea y devuelve el crt_.
//    Guardalo en una cookie httpOnly de tu dominio (dura 30 días).
const { cartToken } = await pow.cart.addLine(null, { variant_id: 12345, quantity: 1 });
const cart = await pow.cart.get(cartToken);

// 4. Checkout hosteado: crear la sesión (token PÚBLICO) y redirigir a `url`.
//    return_url / cancel_url son opcionales: en localhost no las mandes y la
//    compra termina en la confirmación del checkout de la marca.
const session = await pow.checkoutSessions.create({
  cart_token: cartToken!,
  return_url: 'https://tienda.agencia.com/gracias',
  cancel_url: 'https://tienda.agencia.com/carrito',
});
// → 303 a session.url

// 5. En /gracias: el estado REAL del pago, server-side con el token PRIVADO
const estado = await pow.checkoutSessions.get(session.id);
// estado.status: 'open' | 'completed' | 'expired'
// estado.payment_status: 'paid' | 'pending' | 'failed' | 'canceled' | null

// 6. Webhook checkout/completed
export async function POST(req: Request) {
  const r = await verifyWebhook({
    rawBody: await req.text(), // el cuerpo CRUDO
    signatureHeader: req.headers.get('x-webhook-signature'),
    secret: process.env.HERMES_WEBHOOK_SECRET!,
  });
  if (!r.ok) return new Response(r.message, { status: 401 });
  // Deduplicá por r.event.id (los reintentos traen el mismo) y contestá 2xx rápido.
  return new Response(null, { status: 200 });
}
```

Ejemplo mínimo con Next.js App Router: [`examples/next-app-router/`](https://github.com/PowEcommerce/hermes-storefront/tree/main/packages/storefront/examples/next-app-router).
Tienda completa lista para usar (home, PLP, PDP, carrito, checkout, cuenta):
el starter [`starter/`](https://github.com/PowEcommerce/hermes-storefront/tree/main/starter) (`npm create @hermesecommerce/store`).

## Tokens

| Opción | Header | Dónde |
|---|---|---|
| `tenant` | `X-Client-ID` | En todos los pedidos. Con token, el token manda. |
| `publicToken` (`pst_…`) | `X-Storefront-Token` | Todos los métodos salvo los privados. Puede ir al navegador. |
| `privateToken` (`psk_…`) | `X-Storefront-Private-Token` | Sólo `checkoutSessions.get` y `webhooks.*`. En esos pedidos va **sólo** el privado (nunca los dos juntos). |

- Crear un cliente con `privateToken` en el navegador (`typeof window !== 'undefined'`)
  tira `HermesConfigError`. Para el front, creá otro cliente sólo con `publicToken`.
- Un `psk_` pegado en `publicToken` (o al revés) tira al crear el cliente.

El cliente **no guarda estado del comprador**: el token del carrito y la sesión
del comprador se pasan en cada llamada (un mismo cliente en tu servidor atiende
a muchos compradores).

## API

### `config`
| Método | Endpoint |
|---|---|
| `config.get()` | `GET /api/v2/storefront/config` |
| `config.apps()` | `GET /api/v2/storefront/apps` |
| `config.sizeAdvisors()` | `GET /api/v2/storefront/size-advisors` |

### `catalog`
| Método | Endpoint |
|---|---|
| `catalog.products(query?)` | `GET /api/v2/products` · con `{ category: slug }` → `GET /api/v2/products/category/{slug}` |
| `catalog.product(slug, { variant_id?, with_option_pictures? }?)` | `GET /api/v2/items/{id}` |
| `catalog.filters(query?)` | `GET /api/v2/products/filters` |
| `catalog.categories()` | `GET /api/v2/categories/header` |
| `catalog.search(q, query?)` | `GET /api/v2/search` |
| `catalog.suggest(q, { limit? }?)` | `GET /api/v2/search/suggest` |
| `catalog.bySkus(skus)` | `GET /api/v2/items?skus=a,b,c` (tarjetas en el orden pedido; hasta 100 SKUs) |
| `catalog.related(id)` / `catalog.look(id)` | `GET /api/v2/items/{id}/related` · `/look` |
| `catalog.changeVariant(id, groupedPropertyIds)` | `GET /api/v2/items/{id}/change_variant` |
| `catalog.updateVariant(id, optionIds)` | `GET /api/v2/items/{id}/update_variant` |

`query` acepta los filtros de la PLP (`page_number`, `q`, `multicolors`,
`multisizes`, `multicategories`, `min_and_max_price: { min, max }`,
`discount_ranges`, `price: '1' | '-1'`, `views`, `new`…) y cualquier propiedad
de la marca por nombre (`{ Material: 'Algodón' }`). Las listas se pueden pasar
como array (se mandan separadas por coma).

### `content` (page blocks, landings, estáticas)
| Método | Endpoint | Tags |
|---|---|---|
| `content.home({ pbType? }?)` | `GET /api/v2/home/page_blocks` | `home-page-blocks` (60 s) |
| `content.landings()` | `GET /api/v2/landings` | `landings` |
| `content.landing(slug)` | `GET /api/v2/landings/{slug}` (`null` si es 404; otro error se tira) | `landings`, `landing-<slug>` |
| `content.instagram()` | `GET /api/v2/home/instagram` | — (1 h) |
| `content.staticContents()` / `content.staticContent(path)` | `GET /api/v2/static_contents[/{path}]` (`null` si es 404) | `static-contents`, `static-content-<path>` |

Los bloques vienen tipados como unión discriminada por `type`
(`PageBlock`, `PageBlockOf<'PageBlock::Banner'>`). Antes de dibujarlos,
pasalos por los helpers puros (también en `@hermesecommerce/storefront/content`,
sin nada de Node, para client components):

```ts
import { normalizePageBlocks, collectPageSkus, matchSkuRecords, resolveHref } from '@hermesecommerce/storefront';

const { sections, blocks } = normalizePageBlocks(await pow.content.home(), {
  brandHosts: ['www.mimarca.com.ar'],              // links absolutos a la marca → relativos
  routes: { category: (s) => `/categoria/${s}`, product: (s) => `/producto/${s}` }, // rutas del sitio viejo
});
// Un solo pedido con TODOS los SKUs de los carruseles de la página:
const { records } = await pow.catalog.bySkus(collectPageSkus(blocks));
// y en cada SkuCarousel: matchSkuRecords(records, parseSkuCsv(block.sku_carousel))
```

- `normalizePageBlocks` descarta los `null`, los no vigentes y los
  `RandomBannerButton`, saca secciones vacías, numera (`order` 1..n: sólo el
  1 carga su imagen con prioridad), pone el ancho en columnas de 12 (`span:
  { xs, md }`, de `bootstrap_class`), resuelve `href`/`second_href`/`items[].href`
  y decodifica el `&amp;` de los embeds de YouTube. El HTML de `RichText.body`
  **no** se toca: sanitizalo en tu servidor y resolvé sus links después.
- `resolveHref(href, { brandHosts, routes })` → `{ href, external } | null`:
  `www.x.com` → `https://…`, host propio → ruta, `/categorias/x` → `routes.category`,
  `javascript:` → `null`.

### `cart` (token `crt_…` en `X-Cart-Token`)
| Método | Endpoint |
|---|---|
| `cart.get(cartToken?)` | `GET /api/v2/cart` (vacío si no hay token o venció) |
| `cart.addLine(cartToken \| null, { variant_id, quantity?, include_cart? })` → `{ data, cartToken }` | `POST /api/v2/cart/add` |
| `cart.updateLine(cartToken, lineId, quantity)` | `PATCH /api/v2/cart/items/{id}` |
| `cart.removeLine(cartToken, lineId)` | `DELETE /api/v2/cart/items/{id}` |
| `cart.applyCoupon(cartToken, code)` / `cart.removeCoupon(cartToken)` | `POST /api/v2/cart/apply_coupon` · `/remove_coupon` |
| `cart.applyPromotion(cartToken, promotionId)` | `POST /api/v2/cart/apply_promotion` |
| `cart.recommended(cartToken?)` | `GET /api/v2/cart/recommended` |

### `account` (comprador: `X-Customer-Token` / `X-Customer-Refresh`)
Los métodos de login devuelven `{ data, session }`, con
`session = { accessToken, refreshToken, refreshMaxAge }` sacada de los headers
de respuesta (o `null`). Guardalos en cookies httpOnly. Pasá `{ cartToken }`
para que el carrito quede asociado a la cuenta.

| Método | Endpoint |
|---|---|
| `account.login({ email, password }, { cartToken? }?)` | `POST /api/v2/users/sign_in` |
| `account.register(body, { cartToken? }?)` | `POST /api/v2/users/sign_up` |
| `account.sendCode(email)` / `account.verifyCode({ email, code }, { cartToken? }?)` | `POST /api/v2/users/send_code` · `/verify_code` |
| `account.google({ credential }, { cartToken? }?)` | `POST /api/v2/users/google` |
| `account.refresh(refreshToken)` → `{ data, session }` | `POST /api/v2/users/refresh` (rotativo; 409 = otro pedido ya rotó) |
| `account.logout({ accessToken?, refreshToken? })` | `DELETE /api/v2/users/sign_out` |
| `account.me(accessToken?)` | `GET /api/v2/users/me` (nunca 401) |
| `account.exists(email)` | `GET /api/v2/users/exists` |
| `account.orders(accessToken, { page?, per? }?)` / `account.order(accessToken, id)` / `account.cancelOrder(accessToken, id)` | `/api/v2/users/orders…` |
| `account.addresses / createAddress / updateAddress / deleteAddress / setDefaultAddress` | `/api/v2/users/addresses…` |
| `account.updateProfile(accessToken, body)` / `account.updatePassword(accessToken, body)` | `PUT /api/v2/users/profile` · `/password` |

### `checkoutSessions`
| Método | Token | Endpoint |
|---|---|---|
| `checkoutSessions.create({ cart_token, return_url?, cancel_url? })` | público | `POST /api/v2/checkout_sessions` |
| `checkoutSessions.get(id)` | **privado** | `GET /api/v2/checkout_sessions/{id}` |

### `reviews` (app Reseñas; con la app apagada, 404)
`reviews.list(slug, query?)`, `reviews.photos(slug, query?)`,
`reviews.form({ product_id } | { token })`, `reviews.create(body)`,
`reviews.confirmPhotos(id, body)`, `reviews.unsubscribeStatus(token)`,
`reviews.unsubscribe(token)`.

### `webhooks` (token **privado**, scope `webhooks:manage`)
`webhooks.list()`, `webhooks.create({ event: 'checkout/completed' | 'storefront/revalidate', url })`
(el `secret` vuelve UNA vez), `webhooks.delete(id)`,
`webhooks.rotateSecret(id)`, `webhooks.test(id)`.

### Cualquier otro endpoint: `api`
Cliente tipado genérico sobre los 94 paths de la spec (settings, home, landings,
checkout propio, geo, locales…):

```ts
const { data, response } = await pow.api.GET('/api/v2/settings/footer');
const { data: estado } = await pow.api.GET('/api/v2/checkout', {
  // headers de comprador/carrito van en `headers`
  headers: { 'X-Cart-Token': cartToken },
});
await pow.api.POST('/api/v2/checkout/payment/offline', {
  body: { /* PagoOffline */ },
  headers: { 'X-Cart-Token': cartToken, 'X-Idempotency-Key': crypto.randomUUID() },
});
```

`path`, `query` y `body` salen tipados de la spec; `auth: 'private'` para usar el `psk_`.

### Opciones por pedido
Todos los métodos aceptan un último argumento `RequestOptions`:

```ts
await pow.catalog.products({ page_number: 1 }, {
  signal: AbortSignal.timeout(5000),
  headers: { 'X-Forwarded-For': ipDelComprador }, // login/registro desde tu servidor
  fetchOptions: { next: { revalidate: 60 } },      // caché de Next.js (o usá @hermesecommerce/storefront/next)
});
```

## Errores

Todas las respuestas no-2xx tiran `HermesApiError`, sin importar el formato que
use cada módulo de la API (`{ error }`, `{ errors: [] }`, `{ errors: { campo: [] } }`,
`{ success: false, message }` del carrito, `{ ok: false, error }` del checkout,
`{ status: 'error', message }` del login, `field_errors` de reseñas):

```ts
try {
  await pow.cart.applyCoupon(cartToken, 'BIENVENIDA10');
} catch (e) {
  if (isHermesApiError(e)) {
    e.status;     // 422
    e.code;       // 'validation' | 'unauthorized' | 'rate_limited' | 'not_found' | …
    e.message;    // mensajes unidos con ' · '
    e.errors;     // ['Cupón inválido']
    e.body;       // la respuesta cruda
    e.retryAfter; // segundos (429)
    e.requestId;  // en los 500: pasáselo a Pow
  }
}
```

Errores de red: `HermesApiError` con `status: 0` y `code: 'network_error'`.
Errores de configuración (token mal puesto, `psk_` en el navegador, falta un
token): `HermesConfigError`.

## Webhooks

`verifyWebhook({ rawBody, signatureHeader, secret, toleranceSec = 300 })`:

- HMAC-SHA256 del cuerpo **crudo** con el secreto (`whsec_…`), header
  `X-Webhook-Signature: sha256=<hex>`, comparación en tiempo constante
  (`crypto.subtle.verify`).
- Chequea el `timestamp` del cuerpo (±`toleranceSec`, default 5 min).
- Nunca tira por una firma mala: devuelve `{ ok: true, event }` o
  `{ ok: false, reason, message }` con `reason` ∈ `missing_signature`,
  `malformed_signature`, `invalid_signature`, `invalid_body`,
  `timestamp_out_of_range`.
- La idempotencia queda de tu lado: guardá `event.id` (= `X-Webhook-Id`).

## Caché y purga

Cada GET cacheable de la spec declara `x-cache-tags` (plantillas: `product-{id}`,
`category-{slug}`, `settings`…) y `x-cache-ttl` (`short` = 60 s, `long` = 3600 s,
`none` = no cachear). Son **los mismos nombres** que Pow purga: cuando algo
cambia, el webhook `storefront/revalidate` trae
`{ event, id, timestamp, tags: [{ tag, mode: 'soft' | 'hard' }] }` (agrupado
cada ~10 s; hasta 500 tags por evento).

- `soft` (default): marcá el tag stale y regeneralo atrás (stale-while-revalidate).
- `hard`: algo dejó de existir (categoría borrada u oculta, landing despublicada
  o borrada): expiralo ya, sin servir la copia vieja.
- El TTL es la red de seguridad por si una purga se pierde.

### Tags de cada método

```ts
pow.catalog.product.cacheTags('remera-lisa');          // ['product', 'product-remera-lisa']
pow.catalog.products.cacheTags({ category: 'sale' });  // ['products', 'category-sale']
cacheTagsFor('Landings_show', { slug: 'hot-sale' });   // ['landings', 'landing-hot-sale']
cacheInfoFor('GET', '/api/v2/items/{id}', { id: 'x' }); // { operationId, tags, ttl, revalidate }
```

La respuesta de cada método no cambia: los tags se piden aparte, con los
mismos argumentos. `CACHE_OPERATIONS` tiene la tabla completa (generada de la spec).

### Next.js (App Router): `@hermesecommerce/storefront/next`

```ts
// lib/pow.ts — cada GET sale con next: { tags, revalidate } automáticamente
import { createStorefrontClient } from '@hermesecommerce/storefront/next';
export const pow = createStorefrontClient({
  tenant: process.env.HERMES_TENANT,
  publicToken: process.env.HERMES_PUBLIC_TOKEN!,
  apiUrl: process.env.HERMES_API_URL,
});

// app/api/hermes/revalidate/route.ts — verifica la firma y purga cada tag
import { createRevalidateRoute } from '@hermesecommerce/storefront/next';
export const POST = createRevalidateRoute({ secret: process.env.HERMES_REVALIDATE_SECRET });
```

Suscribite una vez (server-side, token privado):

```ts
const { webhook_subscription } = await pow.webhooks.create({
  event: 'storefront/revalidate',
  url: 'https://tienda.agencia.com/api/hermes/revalidate',
});
// guardá webhook_subscription.secret en HERMES_REVALIDATE_SECRET
```

- Purga: Next 16+ → `soft` = `revalidateTag(tag, 'max')`, `hard` =
  `revalidateTag(tag, { expire: 0 })`. (`updateTag` sería el hard nativo pero
  sólo anda en Server Actions, no en una Route Handler.) En Next 14/15
  `revalidateTag` ignora el perfil y siempre expira: los dos modos son `hard`.
- TTL propio: `createStorefrontClient({ ..., nextCache: { ttl: { short: 30 } } })`.
- Un pedido puntual sin caché: `{ fetchOptions: { cache: 'no-store' } }` (si
  pasás `cache` o `next` en `fetchOptions`, mandan los tuyos).
- Las operaciones `none` (datos del comprador, stock en vivo) salen con
  `cache: 'no-store'`; carrito, checkout y cuenta no llevan nada (Next 15+ no
  cachea `fetch` por defecto).
- `onTags` en `createRevalidateRoute` para purgar además tu CDN.

### Otros frameworks

```ts
import { handleRevalidateWebhook } from '@hermesecommerce/storefront';

const r = await handleRevalidateWebhook({
  rawBody,                                           // cuerpo CRUDO
  signatureHeader: req.headers['x-webhook-signature'],
  secret: process.env.HERMES_REVALIDATE_SECRET!,
  onTags: async (tags) => {
    for (const { tag, mode } of tags) await miCache.purgar(tag, { inmediato: mode === 'hard' });
  },
});
res.status(r.status).json(r.body); // 200 ok · 401 firma · 400 timestamp · 500 si onTags tiró (Pow reintenta)
```

`webhook/test` se contesta 200 sin purgar, así el botón de prueba anda contra la misma URL.

## Desarrollo

```bash
cd packages/storefront
npm ci
npm run generate          # regenera src/generated/schema.d.ts y src/generated/cache.ts desde la OpenAPI
npm run check:generated   # falla si el generado está desactualizado (lo corre CI y npm test)
npm run typecheck
npm test                  # vitest
npm run build             # tsup → dist/ (ESM + CJS + d.ts)
npm run smoke:dist        # prueba el dist/ buildeado (CI la corre también en Node 18)

# Smoke opcional contra una API real (sólo GET de config y productos):
STOREFRONT_SMOKE=1 HERMES_SMOKE_API_URL=https://… HERMES_SMOKE_TENANT=tu-marca HERMES_SMOKE_PST=pst_… npm run test:smoke
```

Cuando cambia la API: un PR que trae la `openapi.yaml` nueva y corre
`npm run generate` acá (ver [`CONTRIBUTING.md`](https://github.com/PowEcommerce/hermes-storefront/blob/main/CONTRIBUTING.md)). El CI
falla si la spec y lo generado quedaron desfasados.

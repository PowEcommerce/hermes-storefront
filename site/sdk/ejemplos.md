# Ejemplo: Next.js (App Router)

Una tienda mínima con el SDK: listado de productos, carrito, checkout hosteado,
webhooks firmados y purga de caché por tags. El código se lee de
[`packages/storefront/examples/next-app-router`](https://github.com/PowEcommerce/hermes-storefront/tree/main/packages/storefront/examples/next-app-router)
en el repo, así que esta página siempre muestra la versión de `main`.

### `.env.example`

<<< ../../packages/storefront/examples/next-app-router/.env.example{sh}

### `lib/pow.ts`

<<< ../../packages/storefront/examples/next-app-router/lib/pow.ts

### `app/layout.tsx`

<<< ../../packages/storefront/examples/next-app-router/app/layout.tsx

### `app/page.tsx`

<<< ../../packages/storefront/examples/next-app-router/app/page.tsx

### `app/carrito/page.tsx`

<<< ../../packages/storefront/examples/next-app-router/app/carrito/page.tsx

### `app/gracias/page.tsx`

<<< ../../packages/storefront/examples/next-app-router/app/gracias/page.tsx

### `app/api/cart/route.ts`

<<< ../../packages/storefront/examples/next-app-router/app/api/cart/route.ts

### `app/api/checkout/route.ts`

<<< ../../packages/storefront/examples/next-app-router/app/api/checkout/route.ts

### `app/api/webhooks/pow/route.ts`

<<< ../../packages/storefront/examples/next-app-router/app/api/webhooks/pow/route.ts

### `app/api/hermes/revalidate/route.ts`

<<< ../../packages/storefront/examples/next-app-router/app/api/hermes/revalidate/route.ts


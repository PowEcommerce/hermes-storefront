// Cliente de Pow para el SERVIDOR (Server Components, Route Handlers, Server
// Actions). Nunca lo importes desde un componente 'use client': lleva el psk_.
//
// Viene de `@hermesecommerce/storefront/next`: cada GET cacheable sale con
// `next: { tags, revalidate }` (tags de la spec, TTL corto/largo), y la ruta
// app/api/hermes/revalidate purga esos tags cuando Pow avisa.
import 'server-only';
import { createStorefrontClient } from '@hermesecommerce/storefront/next';

export const pow = createStorefrontClient({
  tenant: process.env.HERMES_TENANT,
  publicToken: process.env.HERMES_PUBLIC_TOKEN!,
  privateToken: process.env.HERMES_PRIVATE_TOKEN,
  apiUrl: process.env.HERMES_API_URL,
});

export const CART_COOKIE = 'pow_cart';

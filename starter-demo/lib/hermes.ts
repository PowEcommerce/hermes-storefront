// Cliente de Hermes para el SERVIDOR (Server Components, Server Actions,
// Route Handlers). Lleva el token privado (psk_): `server-only` hace fallar el
// build si algún componente 'use client' lo importa.
//
// Viene de `@hermesecommerce/storefront/next`: cada GET cacheable sale con
// `next: { tags, revalidate }` (tags y TTL de la spec), y la ruta
// app/api/hermes/revalidate purga esos tags cuando Hermes avisa.
import 'server-only';
import { createStorefrontClient } from '@hermesecommerce/storefront/next';

const vacio = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const hermes = createStorefrontClient({
  tenant: vacio(process.env.HERMES_TENANT),
  publicToken: vacio(process.env.HERMES_PUBLIC_TOKEN),
  privateToken: vacio(process.env.HERMES_PRIVATE_TOKEN),
  apiUrl: vacio(process.env.HERMES_API_URL),
});

/** ¿Hay token privado? Sin él no se puede leer el estado de una checkout session. */
export const tienePrivado = Boolean(vacio(process.env.HERMES_PRIVATE_TOKEN));

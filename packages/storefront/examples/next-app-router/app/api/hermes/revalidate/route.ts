// Webhook `storefront/revalidate`: Pow avisa qué tags purgó de la marca y acá
// se purgan en la caché de Next (soft = stale-while-revalidate, hard = expira
// ya). Suscribila UNA vez desde tu servidor:
//   await pow.webhooks.create({ event: 'storefront/revalidate', url: 'https://tienda.agencia.com/api/hermes/revalidate' })
// y guardá el `secret` que devuelve en HERMES_REVALIDATE_SECRET.
import { createRevalidateRoute } from '@hermesecommerce/storefront/next';

export const POST = createRevalidateRoute({
  secret: process.env.HERMES_REVALIDATE_SECRET,
});

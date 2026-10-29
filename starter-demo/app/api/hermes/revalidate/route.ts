// Webhook `storefront/revalidate`: Hermes avisa qué tags cambiaron (producto,
// categoría, settings…) y acá se purgan de la caché de Next (soft = se sirve
// la copia vieja mientras se regenera; hard = expira ya).
//
// Se suscribe solo con `hermes link --revalidate-url https://tu-dominio/api/hermes/revalidate`,
// que escribe HERMES_REVALIDATE_SECRET en el .env.
import { createRevalidateRoute } from '@hermesecommerce/storefront/next';

export const POST = createRevalidateRoute({
  secret: process.env.HERMES_REVALIDATE_SECRET,
});

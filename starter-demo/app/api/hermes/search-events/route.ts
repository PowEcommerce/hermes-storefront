// Medición del buscador inteligente: el navegador manda acá las búsquedas,
// clics, agregados al carrito y compras (`trackSearch*` de
// @hermesecommerce/storefront/search) y esta ruta los reenvía a Hermes con la
// IP real del comprador (el límite de Hermes es por IP: sin ella, todos los
// compradores compartirían el cupo de tu servidor).
//
// Siempre contesta 202: la medición nunca rompe ni demora la página. Sin la
// app `buscador-inteligente` prendida no llega nada acá.
import { createSearchEventsRoute } from '@hermesecommerce/storefront/next';
import { hermes } from '@/lib/hermes';

export const POST = createSearchEventsRoute({ client: hermes });

// /gp-firebase.js: el service worker de push de Go Personal, en la raíz del
// dominio. Con el push prendido en la app contesta el archivo de Go Personal
// (application/javascript, cacheable un día); apagado, 404. El original no se
// pide en cada request: ver createGoPersonalServiceWorkerRoute.
import { createGoPersonalServiceWorkerRoute } from '@hermesecommerce/storefront/next';
import { hermes } from '@/lib/hermes';

export const dynamic = 'force-dynamic';

export const GET = createGoPersonalServiceWorkerRoute({ client: hermes });

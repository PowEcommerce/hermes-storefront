/**
 * Versión del SDK. Tiene que coincidir con `version` del package.json (lo
 * chequea test/version.test.ts): no hay inyección en el build, así que al
 * subir la versión del paquete se sube acá también.
 */
export const SDK_VERSION = '0.1.0';

/**
 * User-Agent que manda el SDK si el llamador no pasó uno. Hace falta: el WAF
 * de api.pow.la contesta 403 a todo pedido SIN User-Agent, y el `fetch` de un
 * Worker de Cloudflare (tiendas hosteadas en Hermes) no manda ninguno.
 */
export const DEFAULT_USER_AGENT = `hermes-storefront/${SDK_VERSION}`;

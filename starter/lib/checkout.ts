// Decisiones puras del checkout hosteado (sin imports: se testean solas).

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** true si la URL es de desarrollo local (localhost, 127.0.0.1, *.localhost) o no es https. */
export function esSitioLocal(site: string): boolean {
  let u: URL;
  try {
    u = new URL(site);
  } catch {
    return true;
  }
  const host = u.hostname.toLowerCase();
  return u.protocol !== 'https:' || HOSTS_LOCALES.has(host) || host.endsWith('.localhost');
}

/**
 * `return_url` / `cancel_url` de la checkout session. En desarrollo (localhost
 * o sin https) NO se mandan: la API sólo acepta https en los dominios del
 * token, y el firewall de la API rechaza "localhost" en el cuerpo. Sin ellas,
 * el checkout hosteado muestra su propia confirmación y "Volver a la tienda"
 * va al dominio de la marca (como en Hydrogen).
 */
export function urlsDeVuelta(site: string): { return_url?: string; cancel_url?: string } {
  if (esSitioLocal(site)) return {};
  const base = site.replace(/\/+$/, '');
  return { return_url: `${base}/checkout/vuelta`, cancel_url: `${base}/carrito` };
}

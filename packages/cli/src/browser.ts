/**
 * Abrir el navegador con URLs que vienen de afuera (la API), sin shell.
 */

/** El admin de Hermes, donde se aprueba un `hermes login`. */
export const ADMIN_HOSTS = ['hermes.pow.la'];

/**
 * ¿La `verification_uri` que devolvió la API se puede abrir sola? Tiene que ser
 * https y del mismo host que la API configurada o del admin conocido
 * (hermes.pow.la). Si no, la CLI sólo la muestra.
 */
export function verificacionConfiable(uri: string, api: string): URL | null {
  let u: URL;
  let a: URL;
  try {
    u = new URL(uri);
    a = new URL(api);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  return host === a.hostname.toLowerCase() || ADMIN_HOSTS.includes(host) ? u : null;
}

/**
 * El comando para abrir `url` en el navegador según el sistema, sin pasar por
 * un shell. En Windows `cmd /c start` interpreta `&`, `|`, `^`… del link (un
 * link de la API podría correr comandos): `rundll32 url.dll,FileProtocolHandler`
 * recibe la URL como un solo argumento. Sólo http(s).
 */
export function comandoParaAbrir(url: string, sistema: NodeJS.Platform): [string, string[]] | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const href = u.href;
  if (sistema === 'darwin') return ['open', [href]];
  if (sistema === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', href]];
  return ['xdg-open', [href]];
}

// Destinos de vuelta (?volver=…) que vienen del navegador: sólo rutas de esta
// misma tienda. Evita open redirects del estilo `https://evil.com`, `//evil.com`
// y `/\evil.com` (los navegadores tratan `\` como `/`, así que `/\evil.com`
// termina siendo `//evil.com`).

// Origen ficticio para resolver la ruta: lo único que importa es que el
// resultado siga en el MISMO origen.
const BASE = 'https://tienda.invalid';

// Caracteres de control (incluye tab/CR/LF, que el parser de URL descarta en silencio).
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Devuelve `v` normalizado (path + query + hash) si es una ruta interna, o
 * `fallback` si no lo es. Rechaza `\`, caracteres de control, `//…` y cualquier
 * cosa que al resolverse cambie de origen.
 */
export function destinoSeguro(v: string | null | undefined, fallback = '/cuenta'): string {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//')) return fallback;
  if (v.includes('\\') || CONTROL.test(v)) return fallback;
  let url: URL;
  try {
    url = new URL(v, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

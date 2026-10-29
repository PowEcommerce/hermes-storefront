import { isHermesApiError } from '@hermesecommerce/storefront';

/** Un texto que no se le puede mostrar al comprador: HTML (página del WAF/CDN), stack traces, cosas enormes. */
const noMostrable = (m: string) => !m.trim() || /[<>]/.test(m) || m.length > 300 || /^HTTP \d{3} en /.test(m);

/** Mensaje para mostrarle al comprador a partir de un error de la API. */
export function mensajeDeError(e: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  if (isHermesApiError(e)) {
    if (e.code === 'rate_limited') return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
    if (e.status === 0) return 'No pudimos conectarnos con la tienda. Probá de nuevo.';
    if (e.status >= 500 || noMostrable(e.message)) return porDefecto;
    return e.message;
  }
  return porDefecto;
}

/** Detalle de un error para el log del SERVER (nunca para la URL ni la pantalla). */
export function detalleDeError(e: unknown): string {
  if (isHermesApiError(e)) {
    const cuerpo = typeof e.body === 'string' ? e.body : JSON.stringify(e.body ?? null);
    return [
      `${e.request.method} ${e.request.path} → ${e.status} ${e.code}`,
      e.requestId ? `request_id=${e.requestId}` : '',
      `message=${JSON.stringify(e.message)}`,
      `body=${(cuerpo ?? '').replace(/\s+/g, ' ').slice(0, 500)}`,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/**
 * Errores que una Server Action le pasa a una página por la URL: sólo un
 * CÓDIGO (`?error=checkout`), nunca el mensaje de la API (puede traer HTML
 * del WAF, headers o datos internos). La página lo traduce acá; un código
 * desconocido no muestra nada.
 */
export const ERRORES_DE_URL = {
  checkout: 'No pudimos iniciar el checkout. Probá de nuevo en unos minutos.',
} as const;

export type ErrorDeUrl = keyof typeof ERRORES_DE_URL;

export function mensajeDeErrorDeUrl(codigo: unknown): string | null {
  return typeof codigo === 'string' && Object.hasOwn(ERRORES_DE_URL, codigo)
    ? ERRORES_DE_URL[codigo as ErrorDeUrl]
    : null;
}

/** true si el error es un 404 de la API (producto/categoría inexistente, app apagada). */
export const esNoEncontrado = (e: unknown) => isHermesApiError(e) && e.status === 404;

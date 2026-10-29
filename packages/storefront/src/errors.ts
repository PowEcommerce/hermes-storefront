/**
 * Errores de la API normalizados.
 *
 * La API de Pow contesta errores con varios formatos según el módulo (los
 * heredados del storefront de Pow no cambian en v2):
 *
 * - `{ "error": "…" }`                          — la mayoría
 * - `{ "errors": ["…", "…"] }`                  — validación (422)
 * - `{ "errors": { "campo": ["…"] } }`          — pasos del checkout / pagos
 * - `{ "success": false, "message": "…" }`      — carrito
 * - `{ "ok": false, "error": "…", "next": "…" }` — checkout propio y pagos
 * - `{ "status": "error", "message": "…" }`     — login / registro
 * - `{ "success": false, "field_errors": {…} }` — alta de reseñas
 *
 * Todos terminan en un `HermesApiError` con `status`, `code`, `message`,
 * `errors` (lista plana) y `body` (la respuesta tal cual vino).
 */

export type HermesErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'validation'
  | 'rate_limited'
  | 'server_error'
  | 'service_unavailable'
  | 'network_error'
  | 'http_error';

export class HermesApiError extends Error {
  override readonly name = 'HermesApiError';
  /** Status HTTP (0 si el pedido ni siquiera llegó: red, DNS, abort). */
  readonly status: number;
  /** Código estable derivado del status (para `switch`). */
  readonly code: HermesErrorCode;
  /** Todos los mensajes de error, aplanados (`campo: mensaje` si venían por campo). */
  readonly errors: string[];
  /** La respuesta cruda (JSON parseado, o texto si no era JSON). */
  readonly body: unknown;
  /** Segundos a esperar (header `Retry-After`), sólo en 429/503. */
  readonly retryAfter: number | null;
  /** `request_id` que traen los 500: pasalo a Pow para reportar el error. */
  readonly requestId: string | null;
  /** Método y path del pedido que falló (sin query ni tokens). */
  readonly request: { method: string; path: string };

  constructor(init: {
    status: number;
    code?: HermesErrorCode;
    message: string;
    errors?: string[];
    body?: unknown;
    retryAfter?: number | null;
    requestId?: string | null;
    request: { method: string; path: string };
    cause?: unknown;
  }) {
    super(
      init.message,
      init.cause !== undefined ? { cause: init.cause } : undefined,
    );
    this.status = init.status;
    this.code = init.code ?? codigoPorStatus(init.status);
    this.errors = init.errors ?? [init.message];
    this.body = init.body;
    this.retryAfter = init.retryAfter ?? null;
    this.requestId = init.requestId ?? null;
    this.request = init.request;
  }
}

export function isHermesApiError(e: unknown): e is HermesApiError {
  return e instanceof HermesApiError;
}

/** Error de configuración del cliente (token mal puesto, psk_ en el navegador…). */
export class HermesConfigError extends Error {
  override readonly name = 'HermesConfigError';
}

export function codigoPorStatus(status: number): HermesErrorCode {
  if (status === 0) return 'network_error';
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 410) return 'gone';
  if (status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'service_unavailable';
  if (status >= 500) return 'server_error';
  return 'http_error';
}

/** Un cuerpo HTML (página de error del WAF, del balanceador o del CDN). */
const pareceHtml = (s: string) => /^<(!doctype|html|head|body|\?xml)\b/i.test(s) || /<\/(html|body|head)>/i.test(s);

/**
 * Junta los mensajes de cualquiera de los formatos de error de la API. Un
 * cuerpo HTML no es un mensaje (queda en `body`): el error dice
 * `HTTP <status> en <método> <path>` y no se le muestra HTML a nadie.
 */
export function mensajesDeError(body: unknown): string[] {
  if (typeof body === 'string') {
    const t = body.trim();
    return t && !pareceHtml(t) ? [t.slice(0, 500)] : [];
  }
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v.trim()))
      out.push(v.trim());
  };

  push(b.error);
  push(b.message);
  const errors = b.errors;
  if (Array.isArray(errors)) errors.forEach(push);
  else if (errors && typeof errors === 'object')
    porCampo(errors as Record<string, unknown>, push);
  const fieldErrors = b.field_errors;
  if (fieldErrors && typeof fieldErrors === 'object')
    porCampo(fieldErrors as Record<string, unknown>, push);
  const details = b.details;
  if (details && typeof details === 'object' && !Array.isArray(details))
    porCampo(details as Record<string, unknown>, push);
  return out;
}

function porCampo(obj: Record<string, unknown>, push: (v: unknown) => void) {
  for (const [campo, v] of Object.entries(obj)) {
    const lista = Array.isArray(v) ? v : [v];
    for (const m of lista)
      if (typeof m === 'string' && m.trim()) push(`${campo}: ${m.trim()}`);
  }
}

// Headers de seguridad por defecto de la tienda (los aplica next.config.ts a
// todas las rutas). Sin imports de servidor: lo leen next.config.ts y los tests.
//
// La CSP sale en modo REPORT-ONLY por defecto: el navegador avisa en la consola
// lo que bloquearía, sin bloquearlo. Las imágenes del backoffice pueden venir de
// hosts que no conocemos de antemano y el checkout hosteado vive en el dominio
// de cada marca, así que una CSP estricta de entrada puede romper la tienda.
// Cuando la consola quede limpia, `HERMES_CSP_ENFORCE=1` la vuelve obligatoria
// (ver README → "Headers de seguridad").
//
// La tienda no se deja embeber en un iframe ajeno (X-Frame-Options y
// `frame-ancestors 'self'`), salvo la vista previa del editor de inicio
// (`/home/preview`, lib/preview.ts): ésa sí desde el admin de Hermes, y sólo
// desde ahí. Ver `securityHeaders(env, { preview: true })`.
import { ORIGENES_DEL_EDITOR, RUTA_DE_PREVIEW } from './preview';

export interface Header {
  key: string;
  value: string;
}

type Env = Record<string, string | undefined>;

/** Hosts de imágenes conocidos: CDN de Pow/Hermes y Mercado Pago. */
export const IMAGE_HOSTS = [
  'https://*.powcdn.com',
  'https://*.hermescdn.app',
  'https://*.mlstatic.com',
  'https://*.mercadopago.com',
];

/** Mercado Pago (checkout/Bricks, si la tienda los suma). */
const MERCADO_PAGO = ['https://*.mercadopago.com', 'https://*.mercadopago.com.ar', 'https://*.mercadolibre.com', 'https://*.mlstatic.com'];

/** Iframes que deja pasar el sanitizado del HTML del backoffice (lib/sanitize.ts). */
const VIDEOS = ['https://www.youtube.com', 'https://youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

const lista = (v: string | undefined) =>
  (v ?? '')
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean);

/** El origen de una URL (https://api.pow.la/api → https://api.pow.la), o null. */
function origen(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export interface OpcionesDeHeaders {
  /** La vista previa del editor de inicio: embebible desde el admin de Hermes. */
  preview?: boolean;
}

/** Quién puede embeber la página: nadie más que la tienda, o también el admin en la vista previa. */
const frameAncestors = (opts: OpcionesDeHeaders) => ["'self'", ...(opts.preview ? ORIGENES_DEL_EDITOR : [])];

const unicos = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * La Content-Security-Policy. Compatible con Next (App Router mete scripts y
 * estilos inline, por eso `'unsafe-inline'`; en dev además `'unsafe-eval'` y el
 * websocket del HMR), Mercado Pago, los CDN de imágenes y la API de Hermes.
 * Hosts extra por env: `HERMES_CSP_IMG_HOSTS` y `HERMES_CSP_CONNECT_HOSTS`
 * (separados por coma).
 */
export function contentSecurityPolicy(env: Env = process.env, opts: OpcionesDeHeaders = {}): string {
  const dev = env.NODE_ENV === 'development';
  const api = unicos(['https://api.pow.la', origen(env.HERMES_API_URL)]);
  const directivas: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': frameAncestors(opts),
    // Al terminar la compra el form postea a esta tienda y la Server Action
    // redirige al checkout hosteado, que vive en el dominio de cada marca.
    'form-action': ["'self'", 'https:'],
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...MERCADO_PAGO],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...unicos([...IMAGE_HOSTS, ...lista(env.HERMES_CSP_IMG_HOSTS)])],
    'font-src': ["'self'", 'data:'],
    'connect-src': unicos([
      "'self'",
      ...api,
      ...MERCADO_PAGO,
      ...lista(env.HERMES_CSP_CONNECT_HOSTS),
      ...(dev ? ['ws:', 'wss:'] : []),
    ]),
    'frame-src': ["'self'", ...VIDEOS, ...MERCADO_PAGO],
  };
  return Object.entries(directivas)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/**
 * Los headers de seguridad de una ruta. Con `{ preview: true }` (sólo
 * `/home/preview`): sin X-Frame-Options (no admite una lista de orígenes), con
 * `frame-ancestors` que suma el admin de Hermes y SIEMPRE obligatorio (aunque
 * el resto de la CSP siga en Report-Only, que no bloquea iframes), y
 * `X-Robots-Tag: noindex`.
 */
export function securityHeaders(env: Env = process.env, opts: OpcionesDeHeaders = {}): Header[] {
  const enforce = env.HERMES_CSP_ENFORCE === '1' || env.HERMES_CSP_ENFORCE === 'true';
  const csp = {
    key: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    value: contentSecurityPolicy(env, opts),
  };
  const base = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
  if (!opts.preview) return [...base, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, csp];
  return [
    ...base,
    csp,
    ...(enforce ? [] : [{ key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors(opts).join(' ')}` }]),
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ];
}

/**
 * Todas las rutas MENOS la vista previa (path-to-regexp de Next). Las reglas de
 * `headers()` se suman entre sí y una posterior no puede SACAR un header, así
 * que la de toda la tienda no tiene que alcanzar a `/home/preview`.
 */
export const RUTAS_DE_LA_TIENDA = `/:path((?!${RUTA_DE_PREVIEW.slice(1)}$).*)`;

/** Las reglas de `headers()` de next.config.ts. */
export function reglasDeHeaders(env: Env = process.env): { source: string; headers: Header[] }[] {
  return [
    { source: RUTAS_DE_LA_TIENDA, headers: securityHeaders(env) },
    { source: RUTA_DE_PREVIEW, headers: securityHeaders(env, { preview: true }) },
  ];
}

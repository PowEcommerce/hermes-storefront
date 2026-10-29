// Headers de seguridad por defecto de la tienda (los aplica next.config.ts a
// todas las rutas). Sin imports de servidor: lo leen next.config.ts y los tests.
//
// La CSP sale en modo REPORT-ONLY por defecto: el navegador avisa en la consola
// lo que bloquearía, sin bloquearlo. Las imágenes del backoffice pueden venir de
// hosts que no conocemos de antemano y el checkout hosteado vive en el dominio
// de cada marca, así que una CSP estricta de entrada puede romper la tienda.
// Cuando la consola quede limpia, `HERMES_CSP_ENFORCE=1` la vuelve obligatoria
// (ver README → "Headers de seguridad").

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

const unicos = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * La Content-Security-Policy. Compatible con Next (App Router mete scripts y
 * estilos inline, por eso `'unsafe-inline'`; en dev además `'unsafe-eval'` y el
 * websocket del HMR), Mercado Pago, los CDN de imágenes y la API de Hermes.
 * Hosts extra por env: `HERMES_CSP_IMG_HOSTS` y `HERMES_CSP_CONNECT_HOSTS`
 * (separados por coma).
 */
export function contentSecurityPolicy(env: Env = process.env): string {
  const dev = env.NODE_ENV === 'development';
  const api = unicos(['https://api.pow.la', origen(env.HERMES_API_URL)]);
  const directivas: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
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

/** Los headers que next.config.ts aplica a todas las rutas. */
export function securityHeaders(env: Env = process.env): Header[] {
  const enforce = env.HERMES_CSP_ENFORCE === '1' || env.HERMES_CSP_ENFORCE === 'true';
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    {
      key: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      value: contentSecurityPolicy(env),
    },
  ];
}

/**
 * Buscador inteligente (app `buscador-inteligente` del App Store de Pow).
 *
 * Con la app instalada y prendida, la tienda usa el buscador nuevo
 * (`catalog.search`, `catalog.suggest`, `catalog.searchConfig`) y le manda a
 * Hermes la medición (búsquedas, clics, agregados al carrito y compras). Sin
 * la app, la tienda sigue con la búsqueda del listado (`catalog.products({ q })`).
 *
 * Este módulo tiene tres partes, todas sin dependencias de Node ni de Next:
 *
 *  - Lógica pura: `isAppEnabled`, `searchEventsBatch`, `clientIpFrom`,
 *    `deviceFromWidth`.
 *  - Navegador: `sendSearchEvents` y los atajos `trackSearch`,
 *    `trackSearchClick`, `trackSearchAddToCart`, `trackSearchPurchase`. Mandan
 *    los eventos a una ruta de TU tienda (no a la API: el navegador no llama a
 *    la API de Hermes para esto) y NUNCA tiran.
 *  - Servidor: `createSearchEventsRoute`, la Route Handler que recibe esos
 *    eventos y los reenvía a `POST /api/v2/search/events` con la IP real del
 *    comprador (el límite de 300 pedidos por minuto es por IP: sin ella, todos
 *    los compradores comparten el cupo de tu servidor). Siempre contesta 202.
 */
import type { StorefrontClient } from './client';
import type { components } from './generated/schema';

/** Slug de la app del App Store que prende el buscador nuevo. */
export const SEARCH_APP_SLUG = 'buscador-inteligente';

/** Ruta de la tienda donde se monta `createSearchEventsRoute` (default de los `track*`). */
export const SEARCH_EVENTS_ROUTE = '/api/hermes/search-events';

/** Igual que el tope de la API: lo que pase de 50 eventos por lote no viaja. */
export const MAX_SEARCH_EVENTS_PER_BATCH = 50;

/** Un evento de la medición del buscador (`POST /api/v2/search/events`). */
export type SearchEvent = components['schemas']['BusquedaEvento'];
export type SearchEventType = SearchEvent['type'];
/** Respuesta de la ingesta: `{ guardados, descartados, salteado? }`. */
export type SearchEventsResult = components['schemas']['BusquedaIngesta'];
/** Panel vacío del buscador (`GET /api/v2/search/config`). */
export type SearchConfig = components['schemas']['BusquedaPanel'];
/** Una sugerencia del panel (término, categoría, marca o atributo). */
export type SearchSuggestion = components['schemas']['BusquedaSugerencia'];
/** `origin` de un evento: el panel (autocompletar) o la página de resultados. */
export type SearchOrigin = 'panel' | 'page';
export type SearchDevice = 'mobile' | 'tablet' | 'desktop';

const TIPOS: ReadonlySet<string> = new Set<SearchEventType>([
  'search',
  'detail-page-view',
  'add-to-cart',
  'purchase-complete',
]);

// ---------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------

/**
 * ¿La app está instalada Y prendida? Recibe la respuesta de `config.apps()`
 * (o cualquier cosa: ante una forma rara, `false`). Instalada pero apagada,
 * o ausente, es "como siempre".
 */
export function isAppEnabled(apps: unknown, slug: string): boolean {
  const mapa = (apps as { apps?: unknown } | null | undefined)?.apps;
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return false;
  const e = (mapa as Record<string, unknown>)[slug] as
    | { installed?: unknown; enabled?: unknown }
    | null
    | undefined;
  return !!e && e.installed === true && e.enabled === true;
}

/**
 * El cuerpo que manda el navegador → un lote que vale la pena reenviar.
 * Acepta `{ events: [...] }`, una lista o un evento suelto; deja los de tipo
 * conocido y corta en 50. La API valida todo de nuevo (es la fuente de verdad).
 */
export function searchEventsBatch(body: unknown): SearchEvent[] {
  const crudos: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown } | null)?.events)
      ? (body as { events: unknown[] }).events
      : body && typeof body === 'object'
        ? [body]
        : [];
  return crudos
    .filter(
      (e): e is SearchEvent =>
        !!e &&
        typeof e === 'object' &&
        TIPOS.has((e as { type?: unknown }).type as string),
    )
    .slice(0, MAX_SEARCH_EVENTS_PER_BATCH);
}

const PARECE_IP = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * La IP del comprador desde los headers del pedido que llegó a tu servidor:
 * `CF-Connecting-IP` (Cloudflare), `X-Real-IP` o el primer salto de
 * `X-Forwarded-For` (Vercel y la mayoría de los proxies). `null` si no hay
 * una que parezca IP.
 */
export function clientIpFrom(headers: {
  get(nombre: string): string | null;
}): string | null {
  const candidatas = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const c of candidatas) {
    const ip = c?.trim();
    if (ip && PARECE_IP.test(ip)) return ip;
  }
  return null;
}

/** mobile (< 768) / tablet (< 1024) / desktop, por el ancho de la ventana. */
export function deviceFromWidth(ancho: number): SearchDevice {
  if (ancho < 768) return 'mobile';
  if (ancho < 1024) return 'tablet';
  return 'desktop';
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

export interface SearchTrackingOptions {
  /** La ruta de tu tienda con `createSearchEventsRoute` (default `SEARCH_EVENTS_ROUTE`). */
  endpoint?: string;
}

const CLAVE_VISITANTE = 'hermes.search.visitor';
const CLAVE_SESION = 'hermes.search.session';
const CLAVE_ATRIBUCIONES = 'hermes.search.attributions';
const CLAVE_COMPRAS = 'hermes.search.pending-purchases';
const CLAVE_ORDENES = 'hermes.search.reported-orders';
/** El `attribution_token` vale 30 días en la API. */
const VIDA_ATRIBUCION_MS = 30 * 24 * 60 * 60 * 1000;
const TOPE_ATRIBUCIONES = 50;

const hayVentana = () =>
  typeof (globalThis as { window?: unknown }).window !== 'undefined';

function almacen(tipo: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return hayVentana() ? ((globalThis as any)[tipo] as Storage) : null;
  } catch {
    // storage bloqueado (modo privado, cookies apagadas)
    return null;
  }
}

function idAlAzar(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function idPersistente(
  tipo: 'localStorage' | 'sessionStorage',
  clave: string,
): string | null {
  try {
    const s = almacen(tipo);
    if (!s) return null;
    const actual = s.getItem(clave);
    if (actual) return actual;
    const nuevo = idAlAzar();
    s.setItem(clave, nuevo);
    return nuevo;
  } catch {
    return null;
  }
}

function leerJson<T>(clave: string, vacio: T): T {
  try {
    const crudo = almacen('localStorage')?.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : vacio;
  } catch {
    return vacio;
  }
}

function guardarJson(clave: string, valor: unknown): void {
  try {
    almacen('localStorage')?.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin storage: la medición sigue, sin atribución
  }
}

/**
 * Manda eventos a la ruta de tu tienda sin frenar nada: `sendBeacon` si está
 * (sobrevive a que la persona cambie de página justo después del clic), si no
 * `fetch` con `keepalive`. Completa `visitor_id` (localStorage), `session_id`
 * (sessionStorage) y `device` si no vinieron. Fuera del navegador no hace
 * nada. Nunca tira.
 */
export function sendSearchEvents(
  events: SearchEvent[],
  opciones: SearchTrackingOptions = {},
): void {
  try {
    if (!hayVentana() || !events.length) return;
    const ruta = opciones.endpoint ?? SEARCH_EVENTS_ROUTE;
    const visitor_id = idPersistente('localStorage', CLAVE_VISITANTE);
    const session_id = idPersistente('sessionStorage', CLAVE_SESION);
    const ancho = (globalThis as { innerWidth?: number }).innerWidth;
    const device = typeof ancho === 'number' ? deviceFromWidth(ancho) : null;
    const cuerpo = JSON.stringify({
      events: events
        .slice(0, MAX_SEARCH_EVENTS_PER_BATCH)
        .map((e) => ({ visitor_id, session_id, device, ...e })),
    });
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    try {
      if (
        typeof nav?.sendBeacon === 'function' &&
        nav.sendBeacon(ruta, new Blob([cuerpo], { type: 'application/json' }))
      )
        return;
    } catch {
      // sigue con fetch
    }
    void globalThis
      .fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        keepalive: true,
      })
      .catch(() => undefined);
  } catch {
    // la medición nunca rompe la página
  }
}

/** Lo que se recuerda de un producto que se abrió desde una búsqueda. */
export interface SearchAttribution {
  pg_id: number;
  attribution_token: string;
  position?: number | null;
  origin?: SearchOrigin | null;
  term?: string | null;
  /** Cuándo se guardó (ms). */
  at: number;
}

/**
 * La atribución guardada para un producto (por la clave que usaste en
 * `trackSearchClick`, normalmente el slug), o `null` si no vino de una
 * búsqueda o ya venció (30 días).
 */
export function getSearchAttribution(key: string): SearchAttribution | null {
  const todas = leerJson<Record<string, SearchAttribution>>(
    CLAVE_ATRIBUCIONES,
    {},
  );
  const a = todas?.[key];
  if (!a || typeof a !== 'object' || typeof a.attribution_token !== 'string')
    return null;
  return Date.now() - (a.at ?? 0) > VIDA_ATRIBUCION_MS ? null : a;
}

function recordarAtribucion(key: string, a: SearchAttribution): void {
  const todas = leerJson<Record<string, SearchAttribution>>(
    CLAVE_ATRIBUCIONES,
    {},
  );
  const ahora = Date.now();
  const vigentes = Object.entries(todas ?? {})
    .filter(([k, v]) => k !== key && ahora - (v?.at ?? 0) <= VIDA_ATRIBUCION_MS)
    .sort(([, x], [, y]) => (y.at ?? 0) - (x.at ?? 0))
    .slice(0, TOPE_ATRIBUCIONES - 1);
  guardarJson(CLAVE_ATRIBUCIONES, Object.fromEntries([[key, a], ...vigentes]));
}

/** Un producto mostrado en una búsqueda (para las impresiones). */
export interface ShownProduct {
  pg_id: number;
  /** Desde 1. */
  position: number;
  variant_id?: number | null;
}

/**
 * Se mostró una búsqueda (la página de resultados o el panel con productos).
 * Mandalo una vez por búsqueda mostrada.
 */
export function trackSearch(
  e: {
    term: string;
    origin: SearchOrigin;
    results_count: number;
    attribution_token?: string | null;
    shown_products?: ShownProduct[];
  },
  opciones?: SearchTrackingOptions,
): void {
  sendSearchEvents(
    [
      {
        type: 'search',
        term: e.term,
        origin: e.origin,
        results_count: e.results_count,
        attribution_token: e.attribution_token ?? null,
        shown_products: e.shown_products ?? null,
      },
    ],
    opciones,
  );
}

/**
 * Clic en un resultado: manda `detail-page-view` y recuerda la atribución
 * con `key` (el slug del producto, p. ej.) para el carrito y la compra.
 */
export function trackSearchClick(
  e: {
    key: string;
    pg_id: number;
    attribution_token: string;
    position?: number | null;
    origin?: SearchOrigin | null;
    term?: string | null;
  },
  opciones?: SearchTrackingOptions,
): void {
  try {
    const { key, ...a } = e;
    recordarAtribucion(key, { ...a, at: Date.now() });
    sendSearchEvents(
      [
        {
          type: 'detail-page-view',
          pg_id: a.pg_id,
          position: a.position ?? null,
          origin: a.origin ?? null,
          term: a.term ?? null,
          attribution_token: a.attribution_token,
        },
      ],
      opciones,
    );
  } catch {
    // nunca tira
  }
}

interface CompraPendiente {
  pg_id: number;
  variant_id: number | null;
  quantity: number;
  revenue_cents: number | null;
  attribution_token: string;
  at: number;
}

/**
 * Se agregó al carrito un producto. Si vino de una búsqueda (hay atribución
 * para `key`), manda `add-to-cart` y lo deja anotado para la compra
 * (`trackSearchPurchase`). Devuelve si se midió.
 */
export function trackSearchAddToCart(
  e: {
    key: string;
    variant_id?: number | null;
    quantity?: number;
    /** Precio unitario × cantidad, en centavos (si lo tenés). */
    revenue_cents?: number | null;
  },
  opciones?: SearchTrackingOptions,
): boolean {
  try {
    const a = getSearchAttribution(e.key);
    if (!a) return false;
    const quantity = Math.max(1, Math.floor(e.quantity ?? 1));
    sendSearchEvents(
      [
        {
          type: 'add-to-cart',
          pg_id: a.pg_id,
          variant_id: e.variant_id ?? null,
          quantity,
          origin: a.origin ?? null,
          attribution_token: a.attribution_token,
        },
      ],
      opciones,
    );
    const pendientes = leerJson<CompraPendiente[]>(CLAVE_COMPRAS, []);
    const ahora = Date.now();
    guardarJson(
      CLAVE_COMPRAS,
      [
        ...(Array.isArray(pendientes) ? pendientes : []).filter(
          (p) => ahora - (p?.at ?? 0) <= VIDA_ATRIBUCION_MS,
        ),
        {
          pg_id: a.pg_id,
          variant_id: e.variant_id ?? null,
          quantity,
          revenue_cents:
            typeof e.revenue_cents === 'number' && e.revenue_cents >= 0
              ? Math.round(e.revenue_cents)
              : null,
          attribution_token: a.attribution_token,
          at: ahora,
        },
      ].slice(-TOPE_ATRIBUCIONES),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * La compra terminó (en tu página de vuelta del checkout, con la orden ya
 * confirmada server-side): manda `purchase-complete` por cada producto que se
 * agregó al carrito desde una búsqueda y limpia la lista. Idempotente por
 * `order_id` (recargar la página no duplica). Devuelve cuántos mandó.
 */
export function trackSearchPurchase(
  e: { order_id: number },
  opciones?: SearchTrackingOptions,
): number {
  try {
    const reportadas = leerJson<number[]>(CLAVE_ORDENES, []);
    if (Array.isArray(reportadas) && reportadas.includes(e.order_id)) return 0;
    const pendientes = leerJson<CompraPendiente[]>(CLAVE_COMPRAS, []);
    const ahora = Date.now();
    const vigentes = (Array.isArray(pendientes) ? pendientes : []).filter(
      (p) => p && ahora - (p.at ?? 0) <= VIDA_ATRIBUCION_MS,
    );
    guardarJson(
      CLAVE_ORDENES,
      [...(Array.isArray(reportadas) ? reportadas : []), e.order_id].slice(-20),
    );
    guardarJson(CLAVE_COMPRAS, []);
    if (!vigentes.length) return 0;
    sendSearchEvents(
      vigentes.map((p) => ({
        type: 'purchase-complete' as const,
        pg_id: p.pg_id,
        variant_id: p.variant_id,
        quantity: p.quantity,
        revenue_cents: p.revenue_cents,
        order_id: e.order_id,
        attribution_token: p.attribution_token,
      })),
      opciones,
    );
    return vigentes.length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export interface CreateSearchEventsRouteOptions {
  /** El cliente del servidor (el de `@hermesecommerce/storefront/next` o el core). */
  client: Pick<StorefrontClient, 'catalog'>;
  /** Tope del cuerpo en bytes (default 64 KB): lo que pase se descarta. */
  maxBodyBytes?: number;
  /** Timeout del reenvío a la API, en ms (default 5000). */
  timeoutMs?: number;
}

const NADA: SearchEventsResult = { guardados: 0, descartados: 0 };

const respuesta202 = (cuerpo: SearchEventsResult) =>
  new Response(JSON.stringify(cuerpo), {
    status: 202,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Route Handler (App Router o cualquier runtime con `Request`/`Response`) que
 * recibe los eventos del navegador y los reenvía a la API con la IP real del
 * comprador (`X-Forwarded-For`):
 *
 * ```ts
 * // app/api/hermes/search-events/route.ts
 * import { createSearchEventsRoute } from '@hermesecommerce/storefront/next';
 * import { hermes } from '@/lib/hermes';
 * export const POST = createSearchEventsRoute({ client: hermes });
 * ```
 *
 * SIEMPRE contesta 202 (`{ guardados, descartados }`): la medición no puede
 * romper ni demorar la página. Si la API falla o limita (429), `guardados: 0`.
 */
export function createSearchEventsRoute(
  opciones: CreateSearchEventsRouteOptions,
) {
  const tope = opciones.maxBodyBytes ?? 64 * 1024;
  const timeout = opciones.timeoutMs ?? 5000;
  return async function POST(req: Request): Promise<Response> {
    try {
      const texto = await req.text();
      if (!texto || texto.length > tope) return respuesta202(NADA);
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        return respuesta202(NADA);
      }
      const events = searchEventsBatch(cuerpo);
      if (!events.length) return respuesta202(NADA);
      const ip = clientIpFrom(req.headers);
      const signal =
        typeof AbortSignal !== 'undefined' &&
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeout)
          : undefined;
      const r = await opciones.client.catalog.searchEvents(
        { events },
        {
          headers: ip ? { 'X-Forwarded-For': ip } : undefined,
          signal,
        },
      );
      return respuesta202(
        r && typeof r === 'object' && typeof r.guardados === 'number'
          ? r
          : NADA,
      );
    } catch {
      return respuesta202(NADA);
    }
  };
}

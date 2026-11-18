/**
 * Go Personal (app `gopersonal` del App Store de Pow): personalización
 * (carruseles, recomendaciones, buscador, pop-ups —incluido el de intención de
 * salida, que el SDK de Go Personal maneja solo—) y notificaciones push.
 *
 * Con la app instalada y prendida, `GET /api/v2/storefront/config` trae
 * `gopersonal: { sdk_enabled, client_id, push_enabled }` (nunca el token: ése
 * lo usa Go Personal desde sus servidores para leer el catálogo). Guardar la
 * config de la app purga el tag `settings`.
 *
 * Este módulo tiene tres partes, todas sin dependencias de Node ni de Next:
 *
 *  - Lógica pura: `goPersonalFrom` (la config → qué prender),
 *    `goPersonalContextFor` (la ruta → el `pageType` de Go Personal),
 *    `goPersonalCartLines` (las líneas del carrito de Hermes → las de Go Personal).
 *  - Navegador: `loadGoPersonal` carga el SDK (`https://sdk.gopersonal.ai/gs-sdk.js`)
 *    sin bloquear nada, y los atajos `goPersonalPage`, `trackGoPersonalProductView`,
 *    `trackGoPersonalAddToCart`, `trackGoPersonalRemoveFromCart`,
 *    `trackGoPersonalCart`, `trackGoPersonalPurchase`, `goPersonalLogin` y
 *    `goPersonalLogout` le pasan los eventos. Lo que llega antes de que el SDK
 *    termine de cargar queda en una cola (con tope) y sale apenas carga; sin
 *    `loadGoPersonal` (la app apagada) nunca sale. NUNCA tiran.
 *  - Servidor: `createGoPersonalServiceWorkerRoute`, la Route Handler de
 *    `/gp-firebase.js` (el service worker de push en la raíz del dominio).
 *
 * Los eventos son los mismos que manda hoy la app de Go Personal en VTEX
 * (`window.gsSDK`, provider `Custom`, `singlePage`): el `item` es el id del
 * producto de Hermes (el `id` del catálogo que lee Go Personal) y el precio va
 * en pesos (no en centavos).
 */
import type { StorefrontClient } from './client';

/** Slug de la app del App Store. */
export const GOPERSONAL_APP_SLUG = 'gopersonal';
/** El SDK de Go Personal. */
export const GOPERSONAL_SDK_URL = 'https://sdk.gopersonal.ai/gs-sdk.js';
/** El service worker de push que publica Go Personal. */
export const GOPERSONAL_SW_URL = 'https://admin.gopersonal.ai/gp-firebase.js';
/** Dónde tiene que quedar el service worker en la tienda (la raíz del dominio). */
export const GOPERSONAL_SW_PATH = '/gp-firebase.js';
/**
 * Lo que publica hoy Go Personal en `gp-firebase.js`. Se sirve sólo si no se
 * pudo leer el original y no hay ninguna copia en caché (mejor esto que un 502,
 * que deja al navegador sin el service worker nuevo).
 */
export const GOPERSONAL_SW_FALLBACK =
  '"function" === typeof importScripts && importScripts("https://sdk.gopersonal.ai/libs/firebase-messaging-sw.js");\n';

// ---------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------

/** Qué prender en la tienda, según `storefront/config`. */
export interface GoPersonalSettings {
  /** Cargar el SDK (la app prendida Y con el client id cargado). */
  sdkEnabled: boolean;
  /** El client id de Go Personal (null si no hay). */
  clientId: string | null;
  /** Servir `/gp-firebase.js`. */
  pushEnabled: boolean;
}

const APAGADO: GoPersonalSettings = {
  sdkEnabled: false,
  clientId: null,
  pushEnabled: false,
};

/**
 * La respuesta de `config.get()` (o cualquier cosa: ante una forma rara o sin
 * `gopersonal`, todo apagado) → qué prender. `sdkEnabled` exige además un
 * client id que no esté vacío.
 */
export function goPersonalFrom(config: unknown): GoPersonalSettings {
  const gp = (config as { gopersonal?: unknown } | null | undefined)
    ?.gopersonal as
    | { sdk_enabled?: unknown; client_id?: unknown; push_enabled?: unknown }
    | null
    | undefined;
  if (!gp || typeof gp !== 'object') return { ...APAGADO };
  const clientId =
    typeof gp.client_id === 'string' && gp.client_id.trim()
      ? gp.client_id.trim()
      : null;
  return {
    sdkEnabled: gp.sdk_enabled === true && clientId !== null,
    clientId,
    pushEnabled: gp.push_enabled === true,
  };
}

/** Tipos de página de Go Personal. */
export type GoPersonalPageType =
  | 'home'
  | 'product_detail'
  | 'category'
  | 'search'
  | 'cart'
  | 'checkout'
  | 'unknown'
  | (string & {});

/** El contexto de una página (`getContentByContext(pageType, resto)`). */
export interface GoPersonalContext {
  pageType: GoPersonalPageType;
  [extra: string]: unknown;
}

/** Las rutas de tu tienda (default: las del starter). */
export interface GoPersonalRoutes {
  /** Prefijo de la PDP (default `/producto/`). */
  product?: string;
  /** Prefijo de las categorías (default `/categoria/`). */
  category?: string;
  /** Resultados de búsqueda (default `/buscar`). */
  search?: string;
  /** El carrito (default `/carrito`). */
  cart?: string;
  /** Prefijo del checkout (default `/checkout`). */
  checkout?: string;
}

const RUTAS: Required<GoPersonalRoutes> = {
  product: '/producto/',
  category: '/categoria/',
  search: '/buscar',
  cart: '/carrito',
  checkout: '/checkout',
};

const esRuta = (path: string, ruta: string) =>
  path === ruta || path.startsWith(ruta.endsWith('/') ? ruta : `${ruta}/`);

/**
 * La ruta → el contexto de Go Personal para `goPersonalPage`. Devuelve `null`
 * en la PDP y en el carrito: ésas mandan su propio contexto (con el producto,
 * o con las líneas) desde `trackGoPersonalProductView` / `trackGoPersonalCart`.
 */
export function goPersonalContextFor(
  pathname: string,
  rutas: GoPersonalRoutes = {},
): GoPersonalContext | null {
  const r = { ...RUTAS, ...rutas };
  const path = (pathname || '/').split(/[?#]/)[0] || '/';
  if (path === '/') return { pageType: 'home' };
  if (path.startsWith(r.product)) return null;
  if (esRuta(path, r.cart)) return null;
  if (path.startsWith(r.category)) {
    const slug = decodeURIComponent(path.slice(r.category.length).split('/')[0] ?? '');
    return slug ? { pageType: 'category', category: slug } : { pageType: 'category' };
  }
  if (esRuta(path, r.search)) return { pageType: 'search' };
  if (esRuta(path, r.checkout)) return { pageType: 'checkout' };
  return { pageType: 'unknown' };
}

/** Una línea del carrito como la quiere Go Personal (precio unitario en pesos). */
export interface GoPersonalCartLine {
  /** El id del producto de Hermes (`item_id` de la línea). */
  productId: number | string;
  quantity: number;
  /** Precio unitario en pesos. */
  price: number;
  image?: string | null;
}

/** Lo mínimo de una línea del carrito de Hermes (`CartLine`). */
interface LineaDeHermes {
  item_id: number;
  quantity: number;
  price_cents?: number | null;
  image?: string | null;
  ga4_item?: { price?: number | null } | null;
}

/**
 * Las líneas de `cart.get()` → las de Go Personal. El precio unitario sale de
 * `ga4_item.price` (pesos, el del píxel) o, si no está, del total de la línea
 * en centavos ÷ cantidad.
 */
export function goPersonalCartLines(
  items: ReadonlyArray<LineaDeHermes> | null | undefined,
): GoPersonalCartLine[] {
  return (items ?? [])
    .filter((l) => l && l.item_id != null && l.quantity > 0)
    .map((l) => ({
      productId: l.item_id,
      quantity: l.quantity,
      price:
        typeof l.ga4_item?.price === 'number'
          ? l.ga4_item.price
          : typeof l.price_cents === 'number'
            ? Math.round(l.price_cents / l.quantity) / 100
            : 0,
      image: l.image ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

/** Lo que usamos del SDK de Go Personal (`window.gsSDK`). */
export interface GoPersonalSdk {
  getContentByContext(pageType: string, context?: Record<string, unknown>): unknown;
  addInteraction(i: Record<string, unknown>): unknown;
  addInteractionState(state: string, options?: Record<string, unknown>): unknown;
  updateState(state: Record<string, unknown>): unknown;
  login(customerId: string, options?: Record<string, unknown>): unknown;
  logout(): unknown;
  setSharedToken?(): unknown;
}

interface VentanaGp {
  gsSDK?: GoPersonalSdk;
  GSSDK?: {
    default: new (
      clientId: string,
      options: Record<string, unknown>,
    ) => GoPersonalSdk | Promise<GoPersonalSdk>;
  };
}

export interface LoadGoPersonalOptions {
  /** `readSharedSession` (sesión compartida entre dominios). Default false. */
  sharedSession?: boolean;
  /** Otra URL del SDK (tests). */
  src?: string;
}

type Llamada = (sdk: GoPersonalSdk) => void;

/** Tope de la cola mientras carga el SDK (lo viejo se descarta). */
const TOPE_COLA = 50;

const estado: {
  fase: 'idle' | 'loading' | 'ready' | 'failed';
  clientId: string | null;
  cola: Llamada[];
} = { fase: 'idle', clientId: null, cola: [] };

const ventana = (): (VentanaGp & typeof globalThis) | null =>
  typeof window !== 'undefined' && typeof document !== 'undefined'
    ? (window as unknown as VentanaGp & typeof globalThis)
    : null;

function correr(fn: Llamada, sdk: GoPersonalSdk) {
  try {
    const r = fn(sdk) as unknown;
    // Los métodos del SDK son async: un rechazo no tiene que ensuciar la consola.
    if (r && typeof (r as Promise<unknown>).catch === 'function')
      (r as Promise<unknown>).catch(() => undefined);
  } catch {
    // Go Personal nunca rompe la página
  }
}

/** Corre `fn` con el SDK ya cargado, o la encola hasta que cargue. */
function conSdk(fn: Llamada): void {
  try {
    const w = ventana();
    if (!w) return;
    if (estado.fase === 'ready' && w.gsSDK) return correr(fn, w.gsSDK);
    if (estado.fase === 'failed') return;
    estado.cola.push(fn);
    if (estado.cola.length > TOPE_COLA) estado.cola.splice(0, estado.cola.length - TOPE_COLA);
  } catch {
    // nunca tira
  }
}

function vaciarCola(sdk: GoPersonalSdk) {
  const pendientes = estado.cola.splice(0);
  for (const fn of pendientes) correr(fn, sdk);
}

/**
 * Carga el SDK de Go Personal con el client id de la marca: un `<script async>`
 * en el `<head>` (no bloquea el render; llamalo después de montar, p. ej. en
 * un `useEffect`). Idempotente: con el SDK ya cargado (o cargando) no hace
 * nada. Fuera del navegador no hace nada. Nunca tira.
 *
 * Inicializa con `provider: 'Custom'` y `singlePage: true` (como la app de
 * VTEX): el contenido de cada página lo pide `goPersonalPage` /
 * `trackGoPersonalProductView` / `trackGoPersonalCart`, también en las
 * navegaciones del lado del cliente.
 */
export function loadGoPersonal(
  clientId: string,
  opciones: LoadGoPersonalOptions = {},
): void {
  try {
    const w = ventana();
    const id = typeof clientId === 'string' ? clientId.trim() : '';
    if (!w || !id) return;
    if (estado.fase === 'loading' || estado.fase === 'ready') return;
    estado.fase = 'loading';
    estado.clientId = id;

    const iniciar = async () => {
      try {
        if (!w.GSSDK?.default) throw new Error('sin GSSDK');
        const compartida = opciones.sharedSession === true;
        const sdk = await new w.GSSDK.default(id, {
          provider: 'Custom',
          singlePage: true,
          context: {},
          readSharedSession: compartida,
        });
        w.gsSDK = sdk;
        if (compartida) await sdk.setSharedToken?.();
        estado.fase = 'ready';
        vaciarCola(sdk);
      } catch {
        estado.fase = 'failed';
        estado.cola.length = 0;
      }
    };

    // Ya estaba en la página (otra integración, o una recarga del módulo).
    if (w.GSSDK?.default) {
      void iniciar();
      return;
    }
    const script = document.createElement('script');
    script.src = opciones.src ?? GOPERSONAL_SDK_URL;
    script.async = true;
    script.onload = () => void iniciar();
    script.onerror = () => {
      estado.fase = 'failed';
      estado.cola.length = 0;
    };
    document.head.appendChild(script);
  } catch {
    estado.fase = 'failed';
  }
}

/**
 * El contenido personalizado de una página (`getContentByContext`). Para la
 * home, categorías, búsqueda y checkout; usá `goPersonalContextFor(pathname)`.
 * Con `null` no hace nada.
 */
export function goPersonalPage(ctx: GoPersonalContext | null): void {
  if (!ctx?.pageType) return;
  const { pageType, ...resto } = ctx;
  conSdk((sdk) => sdk.getContentByContext(String(pageType), { ...resto, singlePage: true }));
}

/**
 * Vista de producto (PDP): el contenido de la PDP (`product_detail`) y la
 * interacción `view`.
 */
export function trackGoPersonalProductView(productId: number | string): void {
  if (productId == null || productId === '') return;
  const item = String(productId);
  conSdk((sdk) => {
    sdk.getContentByContext('product_detail', { product_id: item, singlePage: true });
    sdk.addInteraction({ event: 'view', item });
  });
}

/** Agregado al carrito: `cart` con la cantidad agregada y el precio unitario (pesos). */
export function trackGoPersonalAddToCart(e: {
  productId: number | string;
  quantity: number;
  price?: number | null;
}): void {
  if (e?.productId == null || !(e.quantity > 0)) return;
  conSdk((sdk) =>
    sdk.addInteraction({
      event: 'cart',
      item: String(e.productId),
      quantity: e.quantity,
      price: typeof e.price === 'number' ? e.price : 0,
    }),
  );
}

/** Quitado del carrito: `remove-cart` con las unidades quitadas. */
export function trackGoPersonalRemoveFromCart(e: {
  productId: number | string;
  quantity: number;
  price?: number | null;
}): void {
  if (e?.productId == null || !(e.quantity > 0)) return;
  conSdk((sdk) =>
    sdk.addInteraction({
      event: 'remove-cart',
      item: String(e.productId),
      quantity: e.quantity,
      price: typeof e.price === 'number' ? e.price : 0,
    }),
  );
}

/**
 * Cambio de cantidad de una línea: `cart` con la diferencia si subió,
 * `remove-cart` si bajó (lo que pide la guía de Go Personal).
 */
export function trackGoPersonalQuantityChange(e: {
  productId: number | string;
  from: number;
  to: number;
  price?: number | null;
}): void {
  const dif = Math.trunc(e.to) - Math.trunc(e.from);
  if (dif > 0) trackGoPersonalAddToCart({ productId: e.productId, quantity: dif, price: e.price });
  else if (dif < 0)
    trackGoPersonalRemoveFromCart({ productId: e.productId, quantity: -dif, price: e.price });
}

/**
 * El carrito abierto (la página del carrito, o un carrito lateral): el
 * contenido de la página `cart` con sus líneas y el estado del carrito
 * (`updateState`), o `clean-cart` si quedó vacío. Pasale
 * `goPersonalCartLines(cart.items)`. `page: false` sólo actualiza el estado
 * (sin pedir el contenido de la página).
 */
export function trackGoPersonalCart(
  lineas: ReadonlyArray<GoPersonalCartLine>,
  opciones: { page?: boolean } = {},
): void {
  const ls = (lineas ?? []).filter((l) => l && l.productId != null && l.quantity > 0);
  conSdk((sdk) => {
    if (opciones.page !== false)
      sdk.getContentByContext('cart', {
        cart_items: ls.map((l) => ({ product_id: String(l.productId), quantity: l.quantity })),
        singlePage: true,
      });
    if (!ls.length) {
      sdk.addInteraction({ event: 'clean-cart' });
      return;
    }
    sdk.updateState({
      cart: {
        amountOfProducts: ls.reduce((n, l) => n + l.quantity, 0),
        totalAmount: ls.reduce((n, l) => n + l.price * l.quantity, 0),
        products: ls.map((l) => ({
          id: String(l.productId),
          price: l.price,
          quantity: l.quantity,
          image_url: l.image ?? null,
        })),
      },
    });
  });
}

const CLAVE_COMPRAS = 'hermes.gopersonal.purchases';

/**
 * La compra terminó (en tu página de vuelta del checkout, con la orden ya
 * confirmada server-side): `addInteractionState('cart', { transactionId })`.
 * Idempotente por `transactionId` (recargar la página no duplica). Devuelve
 * si la mandó.
 */
export function trackGoPersonalPurchase(e: { transactionId: number | string }): boolean {
  try {
    if (!ventana() || e?.transactionId == null || e.transactionId === '') return false;
    const id = String(e.transactionId);
    let hechas: string[] = [];
    try {
      const crudo = globalThis.localStorage?.getItem(CLAVE_COMPRAS);
      const v = crudo ? (JSON.parse(crudo) as unknown) : [];
      hechas = Array.isArray(v) ? v.map(String) : [];
    } catch {
      hechas = [];
    }
    if (hechas.includes(id)) return false;
    try {
      globalThis.localStorage?.setItem(CLAVE_COMPRAS, JSON.stringify([...hechas, id].slice(-20)));
    } catch {
      // sin storage: igual se manda
    }
    conSdk((sdk) => sdk.addInteractionState('cart', { transactionId: id }));
    return true;
  } catch {
    return false;
  }
}

/**
 * El comprador ingresó o se registró: `login(id, { email,
 * param_updateCartFromCustomer: true })` (el carrito de la sesión anónima pasa
 * a la del cliente, como en VTEX).
 */
export function goPersonalLogin(e: { customerId: number | string; email?: string | null }): void {
  if (e?.customerId == null || e.customerId === '') return;
  conSdk((sdk) =>
    sdk.login(String(e.customerId), {
      ...(e.email ? { email: e.email } : {}),
      param_updateCartFromCustomer: true,
    }),
  );
}

/** El comprador cerró la sesión. */
export function goPersonalLogout(): void {
  conSdk((sdk) => sdk.logout());
}

// --- Identidad después de un login hecho en el servidor --------------------

/**
 * Cookie (NO httpOnly, de vida corta) con la que el servidor le avisa al
 * navegador que hubo un login, registro o logout: los formularios de cuenta
 * son Server Actions que terminan en un redirect, así que el navegador no se
 * entera. La lee y la borra `consumeGoPersonalIdentity`.
 */
export const GOPERSONAL_IDENTITY_COOKIE = 'hermes_gp_identity';
/** Vida de la cookie (segundos): sólo tiene que llegar a la próxima página. */
export const GOPERSONAL_IDENTITY_MAX_AGE = 300;

export type GoPersonalIdentity =
  | { type: 'login'; customerId: string; email: string | null }
  | { type: 'logout' };

/** El valor de la cookie para un login (`customerId` + email) o un logout. */
export function goPersonalIdentityCookie(
  e: { customerId: number | string; email?: string | null } | 'logout',
): string {
  if (e === 'logout') return 'logout';
  return encodeURIComponent(
    JSON.stringify({ id: String(e.customerId), email: e.email ?? null }),
  );
}

/** El valor de la cookie → la identidad (o null si no se entiende). */
export function parseGoPersonalIdentity(valor: string | null | undefined): GoPersonalIdentity | null {
  if (!valor) return null;
  if (valor === 'logout') return { type: 'logout' };
  try {
    const v = JSON.parse(decodeURIComponent(valor)) as { id?: unknown; email?: unknown };
    if ((typeof v?.id !== 'string' && typeof v?.id !== 'number') || v.id === '') return null;
    return {
      type: 'login',
      customerId: String(v.id),
      email: typeof v.email === 'string' && v.email ? v.email : null,
    };
  } catch {
    return null;
  }
}

/**
 * En el navegador: si el servidor dejó la cookie de identidad, la borra y
 * manda `login` / `logout` a Go Personal. Llamala en cada navegación (es
 * barato: sólo lee `document.cookie`). Devuelve lo que aplicó.
 */
export function consumeGoPersonalIdentity(): GoPersonalIdentity | null {
  try {
    const w = ventana();
    if (!w) return null;
    const par = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${GOPERSONAL_IDENTITY_COOKIE}=`));
    if (!par) return null;
    document.cookie = `${GOPERSONAL_IDENTITY_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    const id = parseGoPersonalIdentity(par.slice(GOPERSONAL_IDENTITY_COOKIE.length + 1));
    if (id?.type === 'login') goPersonalLogin({ customerId: id.customerId, email: id.email });
    else if (id?.type === 'logout') goPersonalLogout();
    return id;
  } catch {
    return null;
  }
}

/** Sólo para tests: vuelve el estado del cargador a cero. */
export function __resetGoPersonalForTests(): void {
  estado.fase = 'idle';
  estado.clientId = null;
  estado.cola.length = 0;
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export interface CreateGoPersonalServiceWorkerRouteOptions {
  /** El cliente de la tienda (con su token): para leer `storefront/config`. */
  client: Pick<StorefrontClient, 'config'>;
  /**
   * Cuánto se guarda la copia de `gp-firebase.js` (segundos, default 86400 =
   * 1 día). También es el `s-maxage` de la respuesta.
   */
  ttlSeconds?: number;
  /**
   * Cuánto se recuerda en memoria si la marca tiene el push prendido
   * (segundos, default 60). La config ya viene cacheada por tags donde la
   * caché de Next persiste; esto evita un pedido a la API por cada chequeo
   * del service worker donde no.
   */
  configTtlSeconds?: number;
  /** Otro `fetch` (tests). */
  fetch?: typeof fetch;
}

const TIPO_JS = 'application/javascript; charset=utf-8';
/** Tope del archivo: hoy son ~110 bytes; algo enorme no es el service worker. */
const TOPE_SW = 256 * 1024;

/**
 * Route Handler (App Router) de `/gp-firebase.js`, el service worker de push
 * de Go Personal, en la raíz del dominio:
 *
 * ```ts
 * // app/gp-firebase.js/route.ts
 * import { createGoPersonalServiceWorkerRoute } from '@hermesecommerce/storefront/next';
 * import { hermes } from '@/lib/hermes';
 * export const dynamic = 'force-dynamic';
 * export const GET = createGoPersonalServiceWorkerRoute({ client: hermes });
 * ```
 *
 * Con `push_enabled` contesta el contenido de
 * `https://admin.gopersonal.ai/gp-firebase.js` con `Content-Type:
 * application/javascript` y `Cache-Control: public, max-age=3600,
 * s-maxage=86400`; con el push apagado (o sin la app), 404.
 *
 * El original NO se pide en cada request: queda en memoria y, en Cloudflare
 * Workers, en la Cache API del colo (`caches.default`) por `ttlSeconds`. Si
 * Go Personal no responde se sirve la última copia o, sin ninguna, el
 * contenido conocido (`GOPERSONAL_SW_FALLBACK`).
 */
export function createGoPersonalServiceWorkerRoute(
  opciones: CreateGoPersonalServiceWorkerRouteOptions,
) {
  const ttl = Math.max(60, Math.trunc(opciones.ttlSeconds ?? 86400));
  const ttlConfig = Math.max(0, Math.trunc(opciones.configTtlSeconds ?? 60));
  let config: { push: boolean; hasta: number } | null = null;
  let copia: { cuerpo: string; hasta: number } | null = null;

  const pushPrendido = async (): Promise<boolean> => {
    const ahora = Date.now();
    if (config && config.hasta > ahora) return config.push;
    let push = false;
    try {
      push = goPersonalFrom(await opciones.client.config.get()).pushEnabled;
    } catch {
      // Sin config: como con la app apagada (y se vuelve a probar pronto).
      config = { push: false, hasta: ahora + Math.min(ttlConfig, 10) * 1000 };
      return false;
    }
    config = { push, hasta: ahora + ttlConfig * 1000 };
    return push;
  };

  const cacheDelColo = (): Cache | null => {
    try {
      const c = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
      return c?.default ?? null;
    } catch {
      return null;
    }
  };

  const delOriginal = async (): Promise<string | null> => {
    try {
      const f = opciones.fetch ?? globalThis.fetch;
      const r = await f(GOPERSONAL_SW_URL, {
        // Donde la caché de datos de Next persiste, además queda ahí.
        next: { revalidate: ttl },
      } as RequestInit);
      if (!r.ok) return null;
      const cuerpo = await r.text();
      if (!cuerpo.trim() || cuerpo.length > TOPE_SW || /^\s*</.test(cuerpo)) return null;
      return cuerpo;
    } catch {
      return null;
    }
  };

  const cuerpoDelSw = async (req: Request): Promise<string> => {
    const ahora = Date.now();
    if (copia && copia.hasta > ahora) return copia.cuerpo;
    const cache = cacheDelColo();
    // La clave es de la tienda (la Cache API guarda por zona).
    let clave: Request | null = null;
    try {
      clave = new Request(new URL(`${GOPERSONAL_SW_PATH}?gp-upstream=1`, req.url).toString());
    } catch {
      clave = null;
    }
    if (cache && clave) {
      try {
        const r = await cache.match(clave);
        if (r) {
          const cuerpo = await r.text();
          copia = { cuerpo, hasta: ahora + ttl * 1000 };
          return cuerpo;
        }
      } catch {
        // sigue al original
      }
    }
    const nuevo = await delOriginal();
    if (nuevo) {
      copia = { cuerpo: nuevo, hasta: ahora + ttl * 1000 };
      if (cache && clave) {
        try {
          await cache.put(
            clave,
            new Response(nuevo, {
              headers: { 'Content-Type': TIPO_JS, 'Cache-Control': `public, max-age=${ttl}` },
            }),
          );
        } catch {
          // sin Cache API: queda la copia en memoria
        }
      }
      return nuevo;
    }
    // Go Personal no respondió: la última copia (aunque esté vencida) o la
    // conocida, por 5 minutos (no se le pega en cada request mientras está caído).
    copia = { cuerpo: copia?.cuerpo ?? GOPERSONAL_SW_FALLBACK, hasta: ahora + 5 * 60 * 1000 };
    return copia.cuerpo;
  };

  return async function GET(req: Request): Promise<Response> {
    if (!(await pushPrendido()))
      return new Response('Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      });
    const cuerpo = await cuerpoDelSw(req);
    return new Response(cuerpo, {
      status: 200,
      headers: {
        'Content-Type': TIPO_JS,
        'Cache-Control': `public, max-age=3600, s-maxage=${ttl}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}

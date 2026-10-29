import { HermesConfigError } from './errors';
import {
  type Auth,
  type FetchLike,
  type QueryValue,
  type RawResponse,
  type RequestOptions,
  Transport,
  ERROR_PSK_EN_NAVEGADOR,
  enNavegador,
  rellenarPath,
} from './http';
import { type CacheAdapter, type CacheParams, cacheTagsFor } from './cache';
import { isHermesApiError } from './errors';
import type {
  CatalogQuery,
  CuerpoDe,
  CustomerSession,
  HttpMethod,
  OperacionDe,
  PathParamsDe,
  PathsCon,
  QueryDe,
  RespuestaOk,
  operations,
  paths,
} from './types';

export const DEFAULT_API_URL = 'https://api.pow.la';

export interface StorefrontClientOptions {
  /**
   * La marca (`X-Client-ID`, p. ej. `'tu-marca'`). Con token público, el token
   * manda; sirve igual para logs y para las marcas que todavía no exigen token.
   */
  tenant?: string;
  /** Token PÚBLICO de la marca (`pst_…`). Puede viajar al navegador. */
  publicToken?: string;
  /**
   * Token PRIVADO de la agencia (`psk_…`). SÓLO server-side: si se crea un
   * cliente con este token en el navegador, tira error.
   */
  privateToken?: string;
  /** Base de la API, con o sin `/api` (como la escribe `hermes link` en HERMES_API_URL). Default `https://api.pow.la`. */
  apiUrl?: string;
  /** `fetch` a usar (default: el global). Útil para tests, proxies o instrumentación. */
  fetch?: FetchLike;
  /** Headers extra en todos los pedidos. */
  headers?: Record<string, string>;
  /**
   * Caché por tags: recibe los tags/TTL de cada GET (de `x-cache-tags` /
   * `x-cache-ttl`) y devuelve lo que se mezcla en el fetch. En Next.js usá
   * `createStorefrontClient` de `@hermesecommerce/storefront/next`, que ya lo trae.
   */
  cache?: CacheAdapter;
}

/**
 * Un método GET con sus tags de caché a mano: `client.catalog.product.cacheTags('remera')`
 * devuelve los mismos tags que usa el pedido (y que purga Pow).
 */
export type ConCacheTags<F extends (...a: any[]) => unknown> = F & {
  cacheTags: (...a: Parameters<F>) => string[];
};

function conTags<F extends (...a: any[]) => unknown>(
  fn: F,
  tags: (...a: Parameters<F>) => string[],
): ConCacheTags<F> {
  return Object.assign(fn, { cacheTags: tags });
}

const tagsDe = <O extends Parameters<typeof cacheTagsFor>[0]>(
  op: O,
  params: CacheParams<O> = {} as CacheParams<O>,
) => cacheTagsFor(op, params);

type Op<K extends keyof operations> = operations[K];
type Ok<K extends keyof operations> = RespuestaOk<Op<K>>;
type Body<K extends keyof operations> = CuerpoDe<Op<K>>;
type Query<K extends keyof operations> = QueryDe<Op<K>>;

/** Tipo de página de bloques (`'Main Store'`, `'OUTLET'`, `'Locales'`…). */
export type PbType = NonNullable<
  NonNullable<operations['Home_pageBlocks']['parameters']['query']>['pb_type']
>;

/** Opciones del cliente tipado genérico (`client.api.GET('/api/v2/...')`). */
export type ApiRequestOptions<O> = RequestOptions & {
  /** Parámetros de path (`{ id: 'remera' }`). */
  path?: PathParamsDe<O> extends never ? never : PathParamsDe<O>;
  query?: QueryDe<O> extends never
    ? Record<string, QueryValue>
    : QueryDe<O> | Record<string, QueryValue>;
  body?: CuerpoDe<O>;
  /** `'private'` para los endpoints con `psk_` (default `'public'`). */
  auth?: Auth;
};

function sesionDeHeaders(res: Response): CustomerSession | null {
  const accessToken = res.headers.get('X-Customer-Token');
  const refreshToken = res.headers.get('X-Customer-Refresh');
  if (!accessToken || !refreshToken) return null;
  const maxAge = res.headers.get('X-Customer-Refresh-Max-Age');
  return {
    accessToken,
    refreshToken,
    refreshMaxAge: maxAge && /^\d+$/.test(maxAge) ? Number(maxAge) : null,
  };
}

function exigirToken(nombre: string, valor: string | null | undefined): string {
  if (!valor) throw new HermesConfigError(`Falta ${nombre}.`);
  return valor;
}

/**
 * Crea un cliente de la Storefront API v2 de Pow/Hermes.
 *
 * ```ts
 * const pow = createStorefrontClient({ tenant: 'tu-marca', publicToken: process.env.HERMES_PUBLIC_TOKEN });
 * const { items } = await pow.catalog.products({ page_number: 1 });
 * ```
 *
 * El cliente no guarda estado de comprador: el token del carrito (`crt_…`) y
 * la sesión del comprador se pasan en cada llamada (en un servidor, un mismo
 * cliente atiende a muchos compradores).
 */
export function createStorefrontClient(opts: StorefrontClientOptions) {
  const { tenant, publicToken, privateToken } = opts;
  if (!tenant && !publicToken && !privateToken)
    throw new HermesConfigError(
      'createStorefrontClient: pasá `publicToken` (pst_…) y/o `tenant`.',
    );
  if (publicToken && !/^pst_/.test(publicToken))
    throw new HermesConfigError(
      publicToken.startsWith('psk_')
        ? 'Pusiste un token PRIVADO (psk_) en `publicToken`. El privado va en `privateToken` y sólo en el servidor.'
        : '`publicToken` tiene que empezar con pst_.',
    );
  if (privateToken !== undefined) {
    if (enNavegador()) throw new HermesConfigError(ERROR_PSK_EN_NAVEGADOR);
    if (!/^psk_/.test(privateToken))
      throw new HermesConfigError('`privateToken` tiene que empezar con psk_.');
  }
  if (!opts.fetch && typeof globalThis.fetch !== 'function')
    throw new HermesConfigError(
      'No hay `fetch` global (Node < 18): pasá uno en `fetch`.',
    );
  // El `fetch` global se resuelve en CADA pedido (no al crear el cliente):
  // Next.js lo parchea para su Data Cache (tags/revalidate) después de que se
  // evalúan los módulos, y un `fetch` capturado antes se salta la caché.
  const fetchImpl: FetchLike =
    opts.fetch ??
    ((input, init) => (globalThis.fetch as unknown as FetchLike)(input, init));

  const t = new Transport({
    tenant,
    publicToken,
    privateToken,
    apiUrl: (opts.apiUrl ?? DEFAULT_API_URL)
      .replace(/\/+$/, '')
      .replace(/\/api$/, ''),
    fetch: fetchImpl,
    headers: opts.headers,
    cache: opts.cache,
  });

  const call = async <T>(
    method: string,
    path: string,
    x: {
      path?: Record<string, string | number>;
      query?: Record<string, QueryValue>;
      body?: unknown;
      auth?: Auth;
      headers?: Record<string, string | null | undefined>;
      options?: RequestOptions;
    } = {},
  ): Promise<RawResponse<T>> =>
    t.request<T>({
      method,
      path: rellenarPath(path, x.path),
      template: path,
      pathParams: x.path,
      query: x.query,
      body: x.body,
      auth: x.auth,
      headers: x.headers,
      options: x.options,
    });
  const data = async <T>(...a: Parameters<typeof call>): Promise<T> =>
    (await call<T>(...a)).data;

  const cartHeader = (cartToken?: string | null) => ({
    'X-Cart-Token': cartToken ?? null,
  });
  const customerHeader = (accessToken: string) => ({
    'X-Customer-Token': exigirToken(
      'el access token del comprador (X-Customer-Token)',
      accessToken,
    ),
  });

  /** Login/registro/código/Google: el cuerpo + la sesión de los headers. */
  const conSesion = async <T>(r: Promise<RawResponse<T>>) => {
    const { data: body, response } = await r;
    return { data: body, session: sesionDeHeaders(response) };
  };

  // -------------------------------------------------------------------------
  // Cliente tipado genérico: cualquier endpoint de la spec.
  // -------------------------------------------------------------------------
  const generico =
    <M extends HttpMethod>(m: M) =>
    <P extends PathsCon<M>>(
      path: P,
      o: ApiRequestOptions<OperacionDe<P, M>> = {} as ApiRequestOptions<
        OperacionDe<P, M>
      >,
    ): Promise<RawResponse<RespuestaOk<OperacionDe<P, M>>>> =>
      call(m.toUpperCase(), path as string, {
        path: o.path as Record<string, string | number> | undefined,
        query: o.query as Record<string, QueryValue> | undefined,
        body: o.body,
        auth: o.auth,
        options: o,
      });

  const api = {
    GET: generico('get'),
    POST: generico('post'),
    PUT: generico('put'),
    PATCH: generico('patch'),
    DELETE: generico('delete'),
  };

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------
  const config = {
    /** Config de la marca: checkout hosteado y Google login. Cacheala unos minutos. */
    get: (o?: RequestOptions) =>
      data<Ok<'Config_config'>>('GET', '/api/v2/storefront/config', {
        options: o,
      }),
    /** Apps instaladas (reseñas, favoritos, etiquetas…). */
    apps: (o?: RequestOptions) =>
      data<Ok<'Apps_apps'>>('GET', '/api/v2/storefront/apps', { options: o }),
    /** Asesores de talle. */
    sizeAdvisors: (o?: RequestOptions) =>
      data<Ok<'SizeAdvisors_sizeAdvisors'>>(
        'GET',
        '/api/v2/storefront/size-advisors',
        { options: o },
      ),
  };

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------
  const catalog = {
    /**
     * Listado (PLP). Con `category` usa `/v2/products/category/{slug}`; si no,
     * el listado general (`/v2/products`).
     */
    products: (
      query: CatalogQuery & { category?: string } = {},
      o?: RequestOptions,
    ) => {
      const { category, ...q } = query;
      return category
        ? data<Ok<'Products_category'>>(
            'GET',
            '/api/v2/products/category/{slug}',
            {
              path: { slug: category },
              query: q as Record<string, QueryValue>,
              options: o,
            },
          )
        : data<Ok<'Products_index'>>('GET', '/api/v2/products', {
            query: q as Record<string, QueryValue>,
            options: o,
          });
    },
    /** Ficha de producto (PDP) por slug (o id). */
    product: (
      slug: string,
      query: { variant_id?: number; with_option_pictures?: boolean } = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Pdp_show'>>('GET', '/api/v2/items/{id}', {
        path: { id: slug },
        query: {
          variant_id: query.variant_id,
          with_option_pictures: query.with_option_pictures ? 1 : undefined,
        },
        options: o,
      }),
    /** Facetas disponibles para un listado (`category_name` = slug de la categoría). */
    filters: (
      query: CatalogQuery & { category_name?: string } = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Products_filters'>>('GET', '/api/v2/products/filters', {
        query: query as Record<string, QueryValue>,
        options: o,
      }),
    /** Árbol de categorías del menú (raíces, hijas y nietas). */
    categories: (o?: RequestOptions) =>
      data<Ok<'Categories_header'>>('GET', '/api/v2/categories/header', {
        options: o,
      }),
    /** Resultados del buscador. */
    search: (
      q: string,
      query: CatalogQuery & {
        sort?: NonNullable<Query<'Search_buscar'>>['sort'];
      } = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Search_buscar'>>('GET', '/api/v2/search', {
        query: { ...(query as Record<string, QueryValue>), q },
        options: o,
      }),
    /** Autocompletar del buscador. */
    suggest: (q: string, query: { limit?: number } = {}, o?: RequestOptions) =>
      data<Ok<'Search_sugerir'>>('GET', '/api/v2/search/suggest', {
        query: { ...query, q },
        options: o,
      }),
    /**
     * Tarjetas de productos por SKU (carrusel de SKUs de la home, looks), en
     * el orden de los SKUs pedidos. Juntá los SKUs de toda la página en un
     * solo pedido (hasta 100).
     */
    bySkus: (skus: string[], o?: RequestOptions) =>
      data<Ok<'Pdp_bySkus'>>('GET', '/api/v2/items', {
        query: { skus: skus.join(',') },
        options: o,
      }),
    /** Relacionados de un producto. */
    related: (id: string | number, o?: RequestOptions) =>
      data<Ok<'Pdp_related'>>('GET', '/api/v2/items/{id}/related', {
        path: { id },
        options: o,
      }),
    /** "Completá el look". */
    look: (id: string | number, o?: RequestOptions) =>
      data<Ok<'Pdp_look'>>('GET', '/api/v2/items/{id}/look', {
        path: { id },
        options: o,
      }),
    /** Cambio de color en la ficha. */
    changeVariant: (
      id: string | number,
      groupedPropertyIds: number[],
      o?: RequestOptions,
    ) =>
      data<Ok<'Pdp_changeVariant'>>(
        'GET',
        '/api/v2/items/{id}/change_variant',
        {
          path: { id },
          query: { 'grouped_property_id[]': groupedPropertyIds },
          options: o,
        },
      ),
    /** Variante elegida (color + talle) en la ficha. */
    updateVariant: (
      id: string | number,
      optionIds: number[],
      o?: RequestOptions,
    ) =>
      data<Ok<'Pdp_updateVariant'>>(
        'GET',
        '/api/v2/items/{id}/update_variant',
        {
          path: { id },
          query: { 'option_ids[]': optionIds },
          options: o,
        },
      ),
  };

  // -------------------------------------------------------------------------
  // Carrito (token crt_ en X-Cart-Token; el primer addLine lo crea)
  // -------------------------------------------------------------------------
  const cart = {
    /** El carrito (vacío si no hay token o venció; nunca crea nada). */
    get: (cartToken?: string | null, o?: RequestOptions) =>
      data<Ok<'Cart_show'>>('GET', '/api/v2/cart', {
        headers: cartHeader(cartToken),
        options: o,
      }),
    /**
     * Agrega una variante. Sin `cartToken` crea el carrito: guardá el
     * `cartToken` que devuelve (cookie httpOnly) y mandalo de ahí en más.
     */
    addLine: async (
      cartToken: string | null | undefined,
      line: Body<'Cart_add'>,
      o?: RequestOptions,
    ): Promise<{ data: Ok<'Cart_add'>; cartToken: string | null }> => {
      const { data: body, response } = await call<Ok<'Cart_add'>>(
        'POST',
        '/api/v2/cart/add',
        {
          body: line,
          headers: cartHeader(cartToken),
          options: o,
        },
      );
      return {
        data: body,
        cartToken: response.headers.get('X-Cart-Token') ?? cartToken ?? null,
      };
    },
    /** Cambia la cantidad de una línea (`items[].id`). Devuelve el carrito. */
    updateLine: (
      cartToken: string,
      lineId: string | number,
      quantity: number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Cart_updateItem'>>('PATCH', '/api/v2/cart/items/{id}', {
        path: { id: lineId },
        body: { quantity },
        headers: cartHeader(exigirToken('el token del carrito', cartToken)),
        options: o,
      }),
    /** Saca una línea. */
    removeLine: (
      cartToken: string,
      lineId: string | number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Cart_removeItem'>>('DELETE', '/api/v2/cart/items/{id}', {
        path: { id: lineId },
        headers: cartHeader(exigirToken('el token del carrito', cartToken)),
        options: o,
      }),
    /** Aplica un cupón o código de promoción. */
    applyCoupon: (cartToken: string, code: string, o?: RequestOptions) =>
      data<Ok<'Cart_applyCoupon'>>('POST', '/api/v2/cart/apply_coupon', {
        body: { code },
        headers: cartHeader(exigirToken('el token del carrito', cartToken)),
        options: o,
      }),
    /** Quita el cupón (idempotente). */
    removeCoupon: (cartToken: string | null | undefined, o?: RequestOptions) =>
      data<Ok<'Cart_removeCoupon'>>('POST', '/api/v2/cart/remove_coupon', {
        headers: cartHeader(cartToken),
        options: o,
      }),
    /** Elige una promoción (marcas con "Elegí tu promoción"). */
    applyPromotion: (
      cartToken: string,
      promotionId: number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Cart_applyPromotion'>>('POST', '/api/v2/cart/apply_promotion', {
        body: { promotion_id: promotionId },
        headers: cartHeader(exigirToken('el token del carrito', cartToken)),
        options: o,
      }),
    /** Hasta 4 recomendados que no están en el carrito. */
    recommended: (cartToken?: string | null, o?: RequestOptions) =>
      data<Ok<'Cart_recommended'>>('GET', '/api/v2/cart/recommended', {
        headers: cartHeader(cartToken),
        options: o,
      }),
  };

  // -------------------------------------------------------------------------
  // Cuenta del comprador (X-Customer-Token / X-Customer-Refresh)
  // -------------------------------------------------------------------------
  const account = {
    /** Email + contraseña. Pasá el `cartToken` para que el carrito quede asociado a la cuenta. */
    login: (
      body: Body<'Users_signIn'>,
      x: { cartToken?: string | null } = {},
      o?: RequestOptions,
    ) =>
      conSesion(
        call<Ok<'Users_signIn'>>('POST', '/api/v2/users/sign_in', {
          body,
          headers: cartHeader(x.cartToken),
          options: o,
        }),
      ),
    register: (
      body: Body<'Users_signUp'>,
      x: { cartToken?: string | null } = {},
      o?: RequestOptions,
    ) =>
      conSesion(
        call<Ok<'Users_signUp'>>('POST', '/api/v2/users/sign_up', {
          body,
          headers: cartHeader(x.cartToken),
          options: o,
        }),
      ),
    /** Manda un código de ingreso por mail. */
    sendCode: (email: string, o?: RequestOptions) =>
      data<Ok<'Users_sendCode'>>('POST', '/api/v2/users/send_code', {
        body: { email },
        options: o,
      }),
    verifyCode: (
      body: Body<'Users_verifyCode'>,
      x: { cartToken?: string | null } = {},
      o?: RequestOptions,
    ) =>
      conSesion(
        call<Ok<'Users_verifyCode'>>('POST', '/api/v2/users/verify_code', {
          body,
          headers: cartHeader(x.cartToken),
          options: o,
        }),
      ),
    /** Login con Google (`credential` de Google Identity Services). */
    google: (
      body: Body<'Users_google'>,
      x: { cartToken?: string | null } = {},
      o?: RequestOptions,
    ) =>
      conSesion(
        call<Ok<'Users_google'>>('POST', '/api/v2/users/google', {
          body,
          headers: cartHeader(x.cartToken),
          options: o,
        }),
      ),
    /**
     * Canjea el refresh por una sesión nueva (el refresh viejo deja de valer).
     * Un 409 (`X-Customer-Refresh-Race: 1`) es que otro pedido ya lo rotó.
     */
    refresh: (refreshToken: string, o?: RequestOptions) =>
      conSesion(
        call<Ok<'Users_refresh'>>('POST', '/api/v2/users/refresh', {
          headers: {
            'X-Customer-Refresh': exigirToken('el refresh token', refreshToken),
          },
          options: o,
        }),
      ),
    logout: (
      session: Partial<Pick<CustomerSession, 'accessToken' | 'refreshToken'>>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_signOut'>>('DELETE', '/api/v2/users/sign_out', {
        headers: {
          'X-Customer-Token': session.accessToken,
          'X-Customer-Refresh': session.refreshToken,
        },
        options: o,
      }),
    /** Quién está logueado (`logged: false` si el token no sirve; nunca 401). */
    me: (accessToken?: string | null, o?: RequestOptions) =>
      data<Ok<'Users_me'>>('GET', '/api/v2/users/me', {
        headers: { 'X-Customer-Token': accessToken },
        options: o,
      }),
    exists: (email: string, o?: RequestOptions) =>
      data<Ok<'Users_exists'>>('GET', '/api/v2/users/exists', {
        query: { email },
        options: o,
      }),
    orders: (
      accessToken: string,
      query: Query<'Users_orders'> = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_orders'>>('GET', '/api/v2/users/orders', {
        query: query as Record<string, QueryValue>,
        headers: customerHeader(accessToken),
        options: o,
      }),
    order: (accessToken: string, id: string | number, o?: RequestOptions) =>
      data<Ok<'Users_order'>>('GET', '/api/v2/users/orders/{id}', {
        path: { id },
        headers: customerHeader(accessToken),
        options: o,
      }),
    cancelOrder: (
      accessToken: string,
      id: string | number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_cancelOrder'>>(
        'DELETE',
        '/api/v2/users/orders/{id}/cancelacion',
        {
          path: { id },
          headers: customerHeader(accessToken),
          options: o,
        },
      ),
    addresses: (accessToken: string, o?: RequestOptions) =>
      data<Ok<'Users_addresses'>>('GET', '/api/v2/users/addresses', {
        headers: customerHeader(accessToken),
        options: o,
      }),
    createAddress: (
      accessToken: string,
      body: Body<'Users_createAddress'>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_createAddress'>>('POST', '/api/v2/users/addresses', {
        body,
        headers: customerHeader(accessToken),
        options: o,
      }),
    updateAddress: (
      accessToken: string,
      id: string | number,
      body: Body<'Users_updateAddress'>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_updateAddress'>>('PUT', '/api/v2/users/addresses/{id}', {
        path: { id },
        body,
        headers: customerHeader(accessToken),
        options: o,
      }),
    deleteAddress: (
      accessToken: string,
      id: string | number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_destroyAddress'>>(
        'DELETE',
        '/api/v2/users/addresses/{id}',
        {
          path: { id },
          headers: customerHeader(accessToken),
          options: o,
        },
      ),
    setDefaultAddress: (
      accessToken: string,
      id: string | number,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_setDefaultAddress'>>(
        'POST',
        '/api/v2/users/addresses/{id}/default',
        {
          path: { id },
          headers: customerHeader(accessToken),
          options: o,
        },
      ),
    updateProfile: (
      accessToken: string,
      body: Body<'Users_updateProfile'>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_updateProfile'>>('PUT', '/api/v2/users/profile', {
        body,
        headers: customerHeader(accessToken),
        options: o,
      }),
    updatePassword: (
      accessToken: string,
      body: Body<'Users_updatePassword'>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Users_updatePassword'>>('PUT', '/api/v2/users/password', {
        body,
        headers: customerHeader(accessToken),
        options: o,
      }),
  };

  // -------------------------------------------------------------------------
  // Checkout hosteado
  // -------------------------------------------------------------------------
  const checkoutSessions = {
    /**
     * Crea la sesión con el token PÚBLICO (el que tiene tus dominios
     * permitidos) y devuelve `{ id, url, expires_at }`: redirigí a `url`.
     */
    create: (body: Body<'CheckoutSessions_crear'>, o?: RequestOptions) =>
      data<Ok<'CheckoutSessions_crear'>>('POST', '/api/v2/checkout_sessions', {
        body,
        options: o,
      }),
    /** Estado de la sesión y su pago. SÓLO server-side, token PRIVADO. */
    get: (id: string, o?: RequestOptions) =>
      data<Ok<'CheckoutSessions_leer'>>(
        'GET',
        '/api/v2/checkout_sessions/{id}',
        {
          path: { id },
          auth: 'private',
          options: o,
        },
      ),
  };

  // -------------------------------------------------------------------------
  // Reseñas (app Reseñas; con la app apagada, 404)
  // -------------------------------------------------------------------------
  const reviews = {
    /** Lista y resumen de las reseñas de un producto (slug). */
    list: (
      productSlug: string,
      query: Query<'Resenas_lista'> = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Resenas_lista'>>('GET', '/api/v2/items/{id}/product_reviews', {
        path: { id: productSlug },
        query: query as Record<string, QueryValue>,
        options: o,
      }),
    /** Galería de fotos de las reseñas de un producto. */
    photos: (
      productSlug: string,
      query: Query<'Resenas_galeria'> = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Resenas_galeria'>>(
        'GET',
        '/api/v2/items/{id}/product_reviews/photos',
        {
          path: { id: productSlug },
          query: query as Record<string, QueryValue>,
          options: o,
        },
      ),
    /** Formulario: `{ product_id }` o `{ token }` (link del mail de pedido de opinión). */
    form: (
      query: { product_id?: number; variant_id?: number; token?: string },
      o?: RequestOptions,
    ) =>
      data<Ok<'Resenas_formulario'>>('GET', '/api/v2/product_reviews/form', {
        query,
        options: o,
      }),
    /** Alta. Con fotos, devuelve `uploads` con URLs firmadas: subí cada archivo con PUT y confirmá con `confirmPhotos`. */
    create: (body: Body<'Resenas_crear'>, o?: RequestOptions) =>
      data<Ok<'Resenas_crear'>>('POST', '/api/v2/product_reviews', {
        body,
        options: o,
      }),
    confirmPhotos: (
      reviewId: string | number,
      body: Body<'Resenas_confirmarFotos'>,
      o?: RequestOptions,
    ) =>
      data<Ok<'Resenas_confirmarFotos'>>(
        'POST',
        '/api/v2/product_reviews/{id}/photos',
        {
          path: { id: reviewId },
          body,
          options: o,
        },
      ),
    /** Estado de la baja de los mails de pedido de opinión. */
    unsubscribeStatus: (token: string, o?: RequestOptions) =>
      data<Ok<'Resenas_estadoDeBaja'>>(
        'GET',
        '/api/v2/product_reviews/unsubscribe',
        {
          query: { token },
          options: o,
        },
      ),
    unsubscribe: (token: string, o?: RequestOptions) =>
      data<Ok<'Resenas_darDeBaja'>>(
        'POST',
        '/api/v2/product_reviews/unsubscribe',
        {
          body: { token },
          options: o,
        },
      ),
  };

  // -------------------------------------------------------------------------
  // Webhooks (self-service, token PRIVADO con scope webhooks:manage)
  // -------------------------------------------------------------------------
  const webhooks = {
    list: (o?: RequestOptions) =>
      data<Ok<'Webhooks_listar'>>('GET', '/api/v2/webhook_subscriptions', {
        auth: 'private',
        options: o,
      }),
    /** Crea la suscripción. El `secret` (`whsec_…`) vuelve UNA sola vez: guardalo. */
    create: (body: Body<'Webhooks_crear'>, o?: RequestOptions) =>
      data<Ok<'Webhooks_crear'>>('POST', '/api/v2/webhook_subscriptions', {
        body,
        auth: 'private',
        options: o,
      }),
    delete: (id: string | number, o?: RequestOptions) =>
      data<Ok<'Webhooks_borrar'>>(
        'DELETE',
        '/api/v2/webhook_subscriptions/{id}',
        {
          path: { id },
          auth: 'private',
          options: o,
        },
      ),
    /** Rota el secreto (el anterior deja de valer en el acto). */
    rotateSecret: (id: string | number, o?: RequestOptions) =>
      data<Ok<'Webhooks_rotar'>>(
        'POST',
        '/api/v2/webhook_subscriptions/{id}/rotate_secret',
        {
          path: { id },
          auth: 'private',
          options: o,
        },
      ),
    /** Manda un `webhook/test` firmado y devuelve `{ delivered, status }`. */
    test: (id: string | number, o?: RequestOptions) =>
      data<Ok<'Webhooks_probar'>>(
        'POST',
        '/api/v2/webhook_subscriptions/{id}/test',
        {
          path: { id },
          auth: 'private',
          options: o,
        },
      ),
  };

  // -------------------------------------------------------------------------
  // Contenido de la marca (page blocks de la home y landings, estáticas)
  // -------------------------------------------------------------------------
  /** `null` si la API contesta 404 (no existe); cualquier otro error se tira. */
  const oNull = async <T>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      if (isHermesApiError(e) && e.status === 404) return null;
      throw e;
    }
  };
  const content = {
    /**
     * Bloques de la home (secciones) + settings de la marca. `pbType` pide
     * otra página (`'OUTLET'`, `'Locales'`…); sin él, la de la tienda.
     * Pasá el resultado por `normalizePageBlocks` antes de dibujarlo.
     *
     * `homeVersionToken`: vista previa de una versión de la home (el token del
     * link del backoffice). Con un token válido la respuesta trae `preview` y
     * NO se cachea (`cache: 'no-store'`, gane a cualquier adapter); inválido o
     * vencido, la home normal. No lo mandes desde la home pública.
     */
    home: (
      query: { pbType?: PbType; homeVersionToken?: string } = {},
      o?: RequestOptions,
    ) =>
      data<Ok<'Home_pageBlocks'>>('GET', '/api/v2/home/page_blocks', {
        query: {
          ...(query.pbType ? { pb_type: query.pbType } : {}),
          ...(query.homeVersionToken
            ? { home_version_token: query.homeVersionToken }
            : {}),
        },
        options: query.homeVersionToken
          ? {
              ...o,
              fetchOptions: { ...o?.fetchOptions, cache: 'no-store' },
            }
          : o,
      }),
    /** Landings publicadas (sin bloques). */
    landings: (o?: RequestOptions) =>
      data<Ok<'Landings_index'>>('GET', '/api/v2/landings', { options: o }),
    /** Una landing con sus bloques; `null` si no existe. */
    landing: (slug: string, o?: RequestOptions) =>
      oNull(
        data<Ok<'Landings_show'>>('GET', '/api/v2/landings/{slug}', {
          path: { slug },
          options: o,
        }),
      ),
    /** Fotos del feed de Instagram cargadas en el backoffice. */
    instagram: (o?: RequestOptions) =>
      data<Ok<'Home_instagram'>>('GET', '/api/v2/home/instagram', {
        options: o,
      }),
    /** Índice de páginas estáticas (sin el HTML). */
    staticContents: (o?: RequestOptions) =>
      data<Ok<'StaticContents_index'>>('GET', '/api/v2/static_contents', {
        options: o,
      }),
    /** Una página estática (`html_content` CRUDO: sanitizalo); `null` si no existe. */
    staticContent: (path: string, o?: RequestOptions) =>
      oNull(
        data<Ok<'StaticContents_show'>>(
          'GET',
          '/api/v2/static_contents/{path}',
          { path: { path }, options: o },
        ),
      ),
  };

  // -------------------------------------------------------------------------
  // Tags de caché por método GET (`.cacheTags(...)`, mismos argumentos)
  // -------------------------------------------------------------------------
  const configConTags = {
    get: conTags(config.get, () => tagsDe('Config_config')),
    apps: conTags(config.apps, () => tagsDe('Apps_apps')),
    sizeAdvisors: conTags(config.sizeAdvisors, () =>
      tagsDe('SizeAdvisors_sizeAdvisors'),
    ),
  };
  const catalogConTags = {
    ...catalog,
    products: conTags(catalog.products, (query = {}) =>
      query.category
        ? tagsDe('Products_category', { slug: query.category })
        : tagsDe('Products_index'),
    ),
    product: conTags(catalog.product, (slug) =>
      tagsDe('Pdp_show', { id: slug }),
    ),
    filters: conTags(catalog.filters, (query = {}) =>
      tagsDe('Products_filters', {
        category_name:
          typeof query.category_name === 'string'
            ? query.category_name
            : undefined,
      }),
    ),
    categories: conTags(catalog.categories, () => tagsDe('Categories_header')),
    search: conTags(catalog.search, () => tagsDe('Search_buscar')),
    suggest: conTags(catalog.suggest, () => tagsDe('Search_sugerir')),
    bySkus: conTags(catalog.bySkus, () => tagsDe('Pdp_bySkus')),
    related: conTags(catalog.related, () => tagsDe('Pdp_related')),
    look: conTags(catalog.look, () => tagsDe('Pdp_look')),
    changeVariant: conTags(catalog.changeVariant, () =>
      tagsDe('Pdp_changeVariant'),
    ),
    updateVariant: conTags(catalog.updateVariant, () =>
      tagsDe('Pdp_updateVariant'),
    ),
  };
  const contentConTags = {
    home: conTags(content.home, () => tagsDe('Home_pageBlocks')),
    landings: conTags(content.landings, () => tagsDe('Landings_index')),
    landing: conTags(content.landing, (slug) =>
      tagsDe('Landings_show', { slug }),
    ),
    instagram: conTags(content.instagram, () => tagsDe('Home_instagram')),
    staticContents: conTags(content.staticContents, () =>
      tagsDe('StaticContents_index'),
    ),
    staticContent: conTags(content.staticContent, (path) =>
      tagsDe('StaticContents_show', { path }),
    ),
  };
  const reviewsConTags = {
    ...reviews,
    list: conTags(reviews.list, (slug) =>
      tagsDe('Resenas_lista', { id: slug }),
    ),
    photos: conTags(reviews.photos, (slug) =>
      tagsDe('Resenas_galeria', { id: slug }),
    ),
  };

  return {
    api,
    config: configConTags,
    catalog: catalogConTags,
    content: contentConTags,
    cart,
    account,
    checkoutSessions,
    reviews: reviewsConTags,
    webhooks,
  };
}

export type StorefrontClient = ReturnType<typeof createStorefrontClient>;
export type { paths };

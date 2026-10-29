/**
 * Tipos de ayuda sobre los tipos generados desde la OpenAPI
 * (`src/generated/schema.d.ts`, `npm run generate`). No editar el generado a
 * mano: se regenera desde `openapi.yaml`.
 */
import type { components, operations, paths } from './generated/schema';

export type { components, operations, paths };

/** Un schema de la spec por nombre: `Schema<'Carrito'>`, `Schema<'CheckoutSession'>`… */
export type Schema<N extends keyof components['schemas']> =
  components['schemas'][N];

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type JsonDe<R> = R extends { content: { 'application/json': infer B } }
  ? B
  : never;

/** Cuerpo de la respuesta 2xx de una operación. */
export type RespuestaOk<O> = O extends { responses: infer R }
  ?
      | (R extends { 200: infer X } ? JsonDe<X> : never)
      | (R extends { 201: infer X } ? JsonDe<X> : never)
      | (R extends { 202: infer X } ? JsonDe<X> : never)
  : never;

/** Cuerpo JSON que espera una operación. */
export type CuerpoDe<O> = O extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Query de una operación (si tiene). */
export type QueryDe<O> = O extends { parameters: { query?: infer Q } }
  ? [Q] extends [never | undefined]
    ? never
    : NonNullable<Q>
  : never;

/** Parámetros de path de una operación (si tiene). */
export type PathParamsDe<O> = O extends { parameters: { path: infer P } }
  ? [P] extends [never | undefined]
    ? never
    : P
  : never;

/** Paths que tienen el método M. */
export type PathsCon<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends { [K in M]: { responses: unknown } }
    ? P
    : never;
}[keyof paths];

export type OperacionDe<
  P extends keyof paths,
  M extends HttpMethod,
> = paths[P] extends {
  [K in M]: infer O;
}
  ? O
  : never;

// ---------------------------------------------------------------------------
// Atajos para los recursos más usados
// ---------------------------------------------------------------------------

export type StorefrontConfig = Schema<'ConfigStorefront'>;
export type StorefrontApps = Schema<'ConfigApps'>;
export type ProductList = Schema<'ProductosListado'>;
export type ProductFilters = Schema<'CatalogoFacetas'>;
export type Product = Schema<'ProductoFicha'>;
export type HeaderCategories = Schema<'CategoriasHeader'>;
export type SearchResults = Schema<'BusquedaResultados'>;
export type SearchSuggestions = Schema<'BusquedaSugerencias'>;
export type Cart = Schema<'Carrito'>;
export type CartLine = Schema<'CarritoLinea'>;
export type CartAddResult = Schema<'CarritoAgregado'>;
export type CartMessage = Schema<'CarritoMensaje'>;
export type CheckoutSession = Schema<'CheckoutSession'>;
export type CheckoutSessionCreated = Schema<'CheckoutSessionCreada'>;
export type CheckoutSessionCreateInput = Schema<'CheckoutSessionCrear'>;
export type WebhookSubscription = Schema<'WebhookSubscription'>;
export type WebhookSubscriptionWithSecret =
  Schema<'WebhookSubscriptionConSecreto'>;
export type WebhookTestResult = Schema<'WebhookPrueba'>;
export type CheckoutCompletedEvent = Schema<'WebhookEventoCheckoutCompleted'>;
export type WebhookTestEvent = Schema<'WebhookEventoPrueba'>;
export type StorefrontRevalidateEvent =
  Schema<'WebhookEventoStorefrontRevalidate'>;
export type WebhookEvent =
  | CheckoutCompletedEvent
  | StorefrontRevalidateEvent
  | WebhookTestEvent;
export type ReviewList = Schema<'ResenaLista'>;
export type ReviewGallery = Schema<'ResenaGaleria'>;
export type ReviewForm = Schema<'ResenaFormulario'>;
export type ReviewCreateInput = Schema<'ResenaCrear'>;
export type ReviewCreated = Schema<'ResenaCreada'>;
export type CustomerMe = Schema<'CompradorMe'>;
export type CustomerAuthOk = Schema<'CompradorAuthOk'>;
export type CustomerOrders = Schema<'PedidosDelComprador'>;
export type CustomerOrder = Schema<'PedidoDelComprador'>;
export type Address = Schema<'Direccion'>;
export type AddressInput = Schema<'DireccionInput'>;

/**
 * Filtros y orden de los listados de catálogo (PLP, búsqueda, facetas).
 * Además de estos, cualquier propiedad de la marca se filtra por su nombre
 * (`{ Material: 'Algodón' }`).
 */
export interface CatalogQuery {
  /** Página (desde 1). El tamaño lo decide la marca y vuelve en `items_per_page`. */
  page_number?: number;
  /** Texto libre. */
  q?: string;
  /** Colores separados por coma (`'Negro,Blanco'`) o como array. */
  multicolors?: string | string[];
  Color?: string;
  /** Talles separados por coma (`'S,M'`) o como array. */
  multisizes?: string | string[];
  Talle?: string;
  Texture?: string;
  /** Slugs de categorías (incluye subcategorías). */
  multicategories?: string | string[];
  /** Rango de precio en la moneda de la marca. Se manda como JSON. */
  min_and_max_price?: { min?: number; max?: number } | string;
  /** Rangos de descuento (`'1-20,40-60'`) o como array. */
  discount_ranges?: string | string[];
  llega_hoy?: boolean;
  /** SKUs separados por espacio. */
  variant_sku?: string;
  /** Ordenar por precio: `'1'` ascendente, `'-1'` descendente. */
  price?: '1' | '-1';
  views?: '1' | '-1';
  new?: '1' | '-1';
  /** Cualquier otra propiedad de la marca: `{ Material: 'Algodón' }`. */
  [propiedad: string]:
    | string
    | number
    | boolean
    | string[]
    | Record<string, unknown>
    | undefined;
}

/** Sesión del comprador: viaja en headers de respuesta del login/refresh. */
export interface CustomerSession {
  /** `X-Customer-Token` (JWT, 15 min). */
  accessToken: string;
  /** `X-Customer-Refresh` (`rft_…`, rotativo). */
  refreshToken: string;
  /** Vida del refresh en segundos (`X-Customer-Refresh-Max-Age`). */
  refreshMaxAge: number | null;
}

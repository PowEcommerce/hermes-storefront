import { HermesApiError, HermesConfigError, mensajesDeError } from './errors';
import { type CacheAdapter, cacheInfoFor } from './cache';
import { DEFAULT_USER_AGENT } from './version';

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Qué credencial de la marca lleva el pedido. */
export type Auth = 'public' | 'private';

/** Opciones por pedido (todas opcionales). */
export interface RequestOptions {
  /** Para cancelar el pedido (`AbortController`). */
  signal?: AbortSignal;
  /**
   * Headers extra, p. ej. `X-Forwarded-For` con la IP real del comprador
   * (login/registro desde tu servidor) o `X-Idempotency-Key`.
   */
  headers?: Record<string, string>;
  /**
   * Se mezcla tal cual en el `RequestInit` del `fetch`: sirve para el caché
   * de Next.js (`{ next: { revalidate: 60 } }`, `{ cache: 'no-store' }`).
   * Si trae `cache` o `next`, el adapter de caché del cliente no se aplica a
   * ese pedido (manda lo tuyo).
   */
  fetchOptions?: Record<string, unknown>;
}

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[]
  | Record<string, unknown>;

export interface RawRequest {
  method: string;
  /** Path absoluto de la spec (`/api/v2/...`), con `{param}` ya reemplazados. */
  path: string;
  /** El path de la spec SIN reemplazar (`/api/v2/items/{id}`): para la caché. */
  template?: string;
  /** Parámetros de path (para las plantillas de tags). */
  pathParams?: Record<string, string | number>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  auth?: Auth;
  headers?: Record<string, string | null | undefined>;
  options?: RequestOptions;
}

export interface RawResponse<T> {
  data: T;
  response: Response;
}

export interface TransportConfig {
  tenant?: string;
  publicToken?: string;
  privateToken?: string;
  apiUrl: string;
  fetch: FetchLike;
  headers?: Record<string, string>;
  /** Adapter de caché (p. ej. el de `@hermesecommerce/storefront/next`). */
  cache?: CacheAdapter;
}

export const enNavegador = (): boolean =>
  typeof (globalThis as { window?: unknown }).window !== 'undefined';

export const ERROR_PSK_EN_NAVEGADOR =
  'El token privado (psk_) es SÓLO server-side: no lo uses en el navegador. ' +
  'Llamá a estos métodos desde tu servidor (route handler, server action, BFF) ' +
  'y dejá en el front sólo el token público (pst_).';

export function serializarQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      // `option_ids[]`-style: se repite la key; si no termina en [] y es una
      // lista de la PLP (`multicolors`, `multisizes`…) va separada por coma.
      if (k.endsWith('[]')) v.forEach((x) => qs.append(k, String(x)));
      else qs.append(k, v.join(','));
    } else if (typeof v === 'object') {
      qs.append(k, JSON.stringify(v));
    } else {
      qs.append(k, String(v));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function rellenarPath(
  path: string,
  params?: Record<string, string | number>,
): string {
  return path.replace(/\{(\w+)\}/g, (_, nombre: string) => {
    const v = params?.[nombre];
    if (v === undefined || v === null || v === '')
      throw new HermesConfigError(
        `Falta el parámetro de path "${nombre}" para ${path}`,
      );
    return encodeURIComponent(String(v));
  });
}

export class Transport {
  constructor(private readonly cfg: TransportConfig) {}

  headersDeMarca(auth: Auth): Record<string, string> {
    const h: Record<string, string> = {};
    if (auth === 'private') {
      if (!this.cfg.privateToken)
        throw new HermesConfigError(
          'Este método necesita el token privado: pasá `privateToken` (psk_…) a createStorefrontClient (sólo server-side).',
        );
      if (enNavegador()) throw new HermesConfigError(ERROR_PSK_EN_NAVEGADOR);
      // Con el privado, la marca sale del token; no mandamos el público para
      // que nunca viajen juntos.
      h['X-Storefront-Private-Token'] = this.cfg.privateToken;
    } else if (this.cfg.publicToken) {
      h['X-Storefront-Token'] = this.cfg.publicToken;
    }
    if (this.cfg.tenant) h['X-Client-ID'] = this.cfg.tenant;
    return h;
  }

  async request<T>(req: RawRequest): Promise<RawResponse<T>> {
    const method = req.method.toUpperCase();
    const url = this.cfg.apiUrl + req.path + serializarQuery(req.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(this.cfg.headers ?? {}),
      ...this.headersDeMarca(req.auth ?? 'public'),
    };
    for (const [k, v] of Object.entries(req.headers ?? {}))
      if (v) headers[k] = v;
    Object.assign(headers, req.options?.headers ?? {});
    const tieneCuerpo =
      req.body !== undefined && method !== 'GET' && method !== 'HEAD';
    if (tieneCuerpo) headers['Content-Type'] = 'application/json';
    // Sin User-Agent el WAF de api.pow.la da 403 (y el fetch de un Worker de
    // Cloudflare no manda ninguno). No pisamos el del llamador, en ninguna
    // capitalización. En el navegador no se toca: el browser manda el suyo y
    // un header de más podría romper el preflight de CORS.
    if (
      !enNavegador() &&
      !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')
    )
      headers['User-Agent'] = DEFAULT_USER_AGENT;

    const propias = req.options?.fetchOptions;
    let deCache: Record<string, unknown> | undefined;
    if (
      this.cfg.cache &&
      req.template &&
      propias?.cache === undefined &&
      propias?.next === undefined
    ) {
      const info = cacheInfoFor(method, req.template, {
        ...(req.query ?? {}),
        ...(req.pathParams ?? {}),
      });
      if (info) deCache = this.cfg.cache(info);
    }

    const init: RequestInit = {
      ...(deCache as RequestInit | undefined),
      ...(propias as RequestInit | undefined),
      method,
      headers,
      body: tieneCuerpo ? JSON.stringify(req.body) : undefined,
      signal: req.options?.signal,
    };

    let response: Response;
    try {
      response = await this.cfg.fetch(url, init);
    } catch (cause) {
      throw new HermesApiError({
        status: 0,
        message: `No se pudo conectar con la API de Pow (${method} ${req.path}): ${(cause as Error)?.message ?? cause}`,
        request: { method, path: req.path },
        cause,
      });
    }

    const texto = await response.text();
    let data: unknown = null;
    if (texto) {
      try {
        data = JSON.parse(texto);
      } catch {
        data = texto;
      }
    }

    if (!response.ok) {
      const errores = mensajesDeError(data);
      const retry = response.headers.get('Retry-After');
      const reqId =
        (data &&
        typeof data === 'object' &&
        typeof (data as any).request_id === 'string'
          ? (data as any).request_id
          : null) ?? response.headers.get('X-Request-Id');
      throw new HermesApiError({
        status: response.status,
        message: errores.length
          ? errores.join(' · ')
          : `HTTP ${response.status} en ${method} ${req.path}`,
        errors: errores,
        body: data,
        retryAfter: retry && /^\d+$/.test(retry) ? Number(retry) : null,
        requestId: reqId,
        request: { method, path: req.path },
      });
    }
    return { data: data as T, response };
  }
}

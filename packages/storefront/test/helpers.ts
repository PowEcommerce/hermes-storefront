import type { FetchLike } from '../src';

export interface Llamada {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch de mentira: graba los pedidos y contesta lo que le digas. */
export function fetchFalso(
  responder: (l: Llamada) => {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  } = () => ({
    body: {},
  }),
) {
  const llamadas: Llamada[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const l: Llamada = {
      url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    llamadas.push(l);
    const r = responder(l);
    const cuerpo =
      r.body === undefined
        ? ''
        : typeof r.body === 'string'
          ? r.body
          : JSON.stringify(r.body);
    return new Response(cuerpo, {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  return { fetch, llamadas };
}

export const PST = 'pst_' + 'a'.repeat(40);
export const PSK = 'psk_' + 'b'.repeat(40);

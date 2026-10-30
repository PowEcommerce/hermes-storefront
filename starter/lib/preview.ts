// La vista previa del editor de inicio del admin de Hermes (`/home/preview`).
//
// El admin abre en un iframe:
//
//   ${url de la tienda}/home/preview?pb_type=Main%20Store[&home_version_token=<token>]&t=<timestamp>
//
//   - `pb_type`: qué página de bloques (`Main Store` la de la tienda, `OUTLET`
//     la del outlet…). Sin él, la de la tienda.
//   - `home_version_token`: una versión de la home que todavía no está
//     publicada (borrador, programada). La API devuelve los bloques de ESA
//     versión y el objeto `preview`; con un token vencido o inválido, la home
//     publicada (sin error).
//   - `t`: sólo para que el iframe recargue; no se usa.
//
// Esa ruta (y sólo esa) se deja embeber desde el admin: ver
// lib/security-headers.ts y next.config.ts. Sin imports de servidor: lo leen
// next.config.ts, la página y los tests.
import type { PbType } from '@hermesecommerce/storefront';

/** La ruta que abre el admin en su iframe. */
export const RUTA_DE_PREVIEW = '/home/preview';

/** Los orígenes del admin de Hermes: los únicos que pueden embeber la vista previa. */
export const ORIGENES_DEL_EDITOR = ['https://hermes.pow.la', 'https://admin.pow.la'] as const;

/** Los `pb_type` que entiende la API (los demás caen a la home de la tienda). */
const PB_TYPES: readonly PbType[] = ['Main Store', 'OUTLET', 'Landing', 'Landing Outlet', 'Locales', 'NINOS'];

/** Nombres que también puede mandar el admin para la misma página. */
const ALIAS: Record<string, PbType> = { 'outlet store': 'OUTLET', outlet: 'OUTLET' };

/** Primer valor de un searchParam (Next lo da como string, string[] o undefined). */
const primero = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v);

/**
 * El `pb_type` para la API. `Main Store` (o nada, o uno desconocido) va SIN
 * parámetro: es el default del endpoint, igual que la home.
 */
export function pbTypeDelPreview(valor: string | string[] | undefined | null): PbType | undefined {
  const crudo = primero(valor)?.trim();
  if (!crudo) return undefined;
  const pb = PB_TYPES.find((p) => p === crudo) ?? ALIAS[crudo.toLowerCase()];
  return pb === 'Main Store' ? undefined : pb;
}

/** Un token razonable: sin espacios ni caracteres de control, y no infinito. */
const TOKEN_VALIDO = /^[^\s\u0000-\u001f\u007f]{1,512}$/;

/** El `home_version_token` de la URL, o undefined si no hay uno usable. */
export function tokenDeVersion(valor: string | string[] | undefined | null): string | undefined {
  const crudo = primero(valor);
  if (typeof crudo !== 'string') return undefined;
  const token = crudo.trim();
  return TOKEN_VALIDO.test(token) ? token : undefined;
}

/** Qué versión se está mirando (lo que agrega la API con un token válido). */
export interface VersionEnPreview {
  id: number;
  nombre: string;
}

/**
 * El `preview` de la respuesta, validado. undefined si no se mandó token
 * (aunque la API lo traiga: el cartel de «borrador» no puede salir en la home
 * real) o si no tiene la forma esperada.
 */
export function versionDeLaRespuesta(dato: unknown, token: string | undefined): VersionEnPreview | undefined {
  if (!token || !dato || typeof dato !== 'object') return undefined;
  const { version_id, name } = dato as Record<string, unknown>;
  const id = typeof version_id === 'string' ? Number(version_id) : version_id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return undefined;
  return { id, nombre: typeof name === 'string' && name.trim() ? name.trim() : `Versión ${id}` };
}

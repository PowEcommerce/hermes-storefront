// Links del backoffice → links de esta tienda. Sin imports de servidor: lo
// usan los bloques, el sanitizado del HTML y los tests.
import type { ResolveHrefOptions, StorefrontRoutes } from '@hermesecommerce/storefront';

/** Las rutas de esta tienda (si renombrás las carpetas de app/, cambialas acá). */
export const ROUTES = {
  category: (slug: string) => `/categoria/${encodeURIComponent(slug)}`,
  product: (slug: string) => `/producto/${encodeURIComponent(slug)}`,
  landing: (slug: string) => `/pages/${encodeURIComponent(slug)}`,
  home: '/',
} satisfies StorefrontRoutes;

/**
 * Los dominios propios de la marca: un link del backoffice a uno de ellos
 * (`https://www.mimarca.com.ar/categorias/x`) se abre dentro de esta tienda.
 * `HERMES_BRAND_HOSTS` (separados por coma) + el host de `SITE_URL`.
 */
export function brandHosts(env: Record<string, string | undefined> = process.env): string[] {
  const hosts = (env.HERMES_BRAND_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (env.SITE_URL) hosts.push(env.SITE_URL);
  return hosts;
}

export const linkOptions = (): ResolveHrefOptions => ({ brandHosts: brandHosts(), routes: ROUTES });

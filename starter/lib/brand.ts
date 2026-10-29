import 'server-only';
import { cache } from 'react';
import type { StorefrontConfig } from '@hermesecommerce/storefront';
import { hermes } from './hermes';

/**
 * La marca sale de `storefront/config` (la misma config que usa el checkout
 * hosteado): nombre, logo, fuente y los tokens de color. Así la tienda de
 * prueba ya se ve "de la marca" y el salto al checkout no desentona.
 */
export interface Brand {
  name: string;
  /** URL absoluta del logo, o null (el config a veces trae una ruta relativa al sitio de la marca). */
  logo: string | null;
  fontFamily: string | null;
  fontCss: string | null;
  /** Variables CSS para el <html>: --brand-*. */
  cssVars: Record<string, string>;
}

const DEFAULTS = {
  '--brand-bg': '#ffffff',
  '--brand-fg': '#111111',
  '--brand-primary': '#111111',
  '--brand-primary-fg': '#ffffff',
  '--brand-border': '#e5e5e5',
  '--brand-muted': '#f5f5f5',
  '--brand-muted-fg': '#707070',
  '--brand-accent': '#16a34a',
  '--brand-danger': '#dc2626',
  '--brand-radius': '4px',
};

/** Token del checkout → variable de la tienda. El primero que exista manda. */
const MAPA: Record<keyof typeof DEFAULTS, string[]> = {
  '--brand-bg': ['--checkout-fondo'],
  '--brand-fg': ['--checkout-negro', '--checkout-texto'],
  '--brand-primary': ['--checkout-cta', '--checkout-negro'],
  '--brand-primary-fg': ['--checkout-cta-texto', '--checkout-boton-texto'],
  '--brand-border': ['--checkout-gris-borde', '--checkout-paso-gris'],
  '--brand-muted': ['--checkout-gris-claro', '--checkout-gris-caja'],
  '--brand-muted-fg': ['--checkout-item-prop-color', '--checkout-faq-color'],
  '--brand-accent': ['--checkout-descuento', '--checkout-barra'],
  '--brand-danger': ['--checkout-error'],
  '--brand-radius': ['--checkout-boton-radio'],
};

/** Sólo valores CSS "inocentes" (colores, medidas): nada que cierre el bloque de estilos. */
const SEGURO = /^[#a-zA-Z0-9.,%()\s-]+$/;

export function brandFromConfig(config: StorefrontConfig | null, tenant?: string): Brand {
  const cfg = config?.checkout?.config;
  const tokens = config?.checkout?.tokens ?? {};
  const cssVars: Record<string, string> = { ...DEFAULTS };
  for (const [nuestra, suyas] of Object.entries(MAPA)) {
    const v = suyas.map((k) => tokens[k]).find((x) => typeof x === 'string' && SEGURO.test(x));
    if (v) cssVars[nuestra] = v;
  }
  const logo = cfg?.logo && /^https?:\/\//.test(cfg.logo) ? cfg.logo : null;
  const fontCss = cfg?.fuente?.css && /^https:\/\//.test(cfg.fuente.css) ? cfg.fuente.css : null;
  const fontFamily = cfg?.fuente?.familia && /^[\w\s'",-]+$/.test(cfg.fuente.familia) ? cfg.fuente.familia : null;
  return {
    name: cfg?.marca ?? tenant ?? 'Mi tienda',
    logo,
    fontFamily,
    fontCss,
    cssVars,
  };
}

/** La marca del request (deduplicada por render; la respuesta queda en la caché de Next por tags). */
export const getBrand = cache(async (): Promise<Brand> => {
  try {
    return brandFromConfig(await hermes.config.get(), process.env.HERMES_TENANT);
  } catch (e) {
    // Sin config (API caída, token mal puesto) la tienda igual se ve: con los defaults.
    console.error('[hermes] no pude leer storefront/config:', e);
    return brandFromConfig(null, process.env.HERMES_TENANT);
  }
});

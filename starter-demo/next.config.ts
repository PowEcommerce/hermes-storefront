import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security-headers';

const nextConfig: NextConfig = {
  // Las imágenes vienen del CDN de cada marca: usamos <img> directo para no
  // depender del optimizador (anda igual en Vercel, Cloudflare o un server).
  images: { unoptimized: true },
  // La raíz es esta carpeta (evita que Next adivine otra si hay lockfiles más arriba).
  turbopack: { root: __dirname },
  // nosniff, Referrer-Policy, X-Frame-Options y la CSP (en Report-Only por
  // defecto): ver lib/security-headers.ts y el README.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  async rewrites() {
    return [
      // Favicon genérico (app/icon.svg; cambialo por el de tu marca). Los
      // navegadores que igual piden /favicon.ico reciben el mismo SVG, sin 404.
      { source: '/favicon.ico', destination: '/icon.svg' },
      // Rutas del sitio de la marca (las que cargan los bloques del backoffice,
      // los mails y lo que ya indexó Google) → las de esta tienda. Es un
      // rewrite (no redirect): la URL vieja sigue andando tal cual.
      // `resolveHref` (lib/links.ts) además las reescribe al dibujar los bloques.
      { source: '/categorias/:slug', destination: '/categoria/:slug' },
      { source: '/categorias/:parent/:slug', destination: '/categoria/:slug' },
      { source: '/productos/:slug/:rest*', destination: '/producto/:slug' },
    ];
  },
};

export default nextConfig;

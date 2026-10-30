import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ORIGENES_DEL_EDITOR, RUTA_DE_PREVIEW, pbTypeDelPreview, tokenDeVersion, versionDeLaRespuesta } from '../lib/preview';
import { reglasDeHeaders, securityHeaders } from '../lib/security-headers';

// El mismo compilador de rutas que usa `next build` para el routes-manifest
// (y OpenNext en el hosting): así el test prueba el regex real de cada regla.
const require = createRequire(import.meta.url);
const { buildCustomRoute } = require('next/dist/lib/build-custom-route.js') as {
  buildCustomRoute: (tipo: 'header', r: { source: string; headers: unknown[] }) => { regex: string };
};

/** Los headers que Next le pone a una ruta: todas las reglas que matchean, en orden. */
function headersDe(ruta: string, env: Record<string, string | undefined> = { NODE_ENV: 'production' }) {
  const out: Record<string, string> = {};
  for (const r of reglasDeHeaders(env)) {
    if (new RegExp(buildCustomRoute('header', r).regex).test(ruta)) for (const h of r.headers) out[h.key] = h.value;
  }
  return out;
}

describe('pbTypeDelPreview', () => {
  it('Main Store, vacío o desconocido → sin parámetro (la home de la tienda)', () => {
    expect(pbTypeDelPreview('Main Store')).toBeUndefined();
    expect(pbTypeDelPreview(undefined)).toBeUndefined();
    expect(pbTypeDelPreview('  ')).toBeUndefined();
    expect(pbTypeDelPreview('<script>')).toBeUndefined();
  });
  it('los otros tipos viajan tal cual; Outlet Store es el OUTLET', () => {
    expect(pbTypeDelPreview('OUTLET')).toBe('OUTLET');
    expect(pbTypeDelPreview('Locales')).toBe('Locales');
    expect(pbTypeDelPreview('Outlet Store')).toBe('OUTLET');
    expect(pbTypeDelPreview(['OUTLET', 'Main Store'])).toBe('OUTLET');
  });
});

describe('tokenDeVersion', () => {
  it('acepta un token y lo recorta', () => {
    expect(tokenDeVersion(' abc_DEF-123 ')).toBe('abc_DEF-123');
    expect(tokenDeVersion(['uno', 'dos'])).toBe('uno');
  });
  it('descarta vacíos, con espacios o enormes', () => {
    for (const v of [undefined, null, '', '   ', 'con espacio', 'x'.repeat(513)]) expect(tokenDeVersion(v)).toBeUndefined();
  });
});

describe('versionDeLaRespuesta', () => {
  it('con token y la forma del contrato → id y nombre', () => {
    expect(versionDeLaRespuesta({ version_id: 7, name: ' Cyber ', estado: 'borrador' }, 'tok')).toEqual({ id: 7, nombre: 'Cyber' });
    expect(versionDeLaRespuesta({ version_id: '8', name: '' }, 'tok')).toEqual({ id: 8, nombre: 'Versión 8' });
  });
  it('sin token no hay cartel (aunque la API lo mande)', () => {
    expect(versionDeLaRespuesta({ version_id: 7, name: 'x' }, undefined)).toBeUndefined();
    expect(versionDeLaRespuesta(null, 'tok')).toBeUndefined();
    expect(versionDeLaRespuesta({ version_id: 'x' }, 'tok')).toBeUndefined();
  });
});

describe('headers: sólo /home/preview se deja embeber, y sólo desde el admin', () => {
  it('el resto de la tienda sigue sin dejarse embeber', () => {
    for (const ruta of ['/', '/home', '/producto/remera', `${RUTA_DE_PREVIEW}/otra`, '/home/previews', '/categoria/home']) {
      const h = headersDe(ruta);
      expect(h['X-Frame-Options'], ruta).toBe('SAMEORIGIN');
      expect(h['Content-Security-Policy-Report-Only'], ruta).toContain("frame-ancestors 'self';");
      expect(h['Content-Security-Policy'], ruta).toBeUndefined();
      expect(h['X-Robots-Tag'], ruta).toBeUndefined();
    }
  });

  it('/home/preview: sin X-Frame-Options y frame-ancestors obligatorio con el admin', () => {
    const h = headersDe(RUTA_DE_PREVIEW);
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['Content-Security-Policy']).toBe(`frame-ancestors 'self' ${ORIGENES_DEL_EDITOR.join(' ')}`);
    expect(h['Content-Security-Policy-Report-Only']).toContain(`frame-ancestors 'self' https://hermes.pow.la https://admin.pow.la;`);
    expect(h['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it('con HERMES_CSP_ENFORCE la CSP completa ya lleva el frame-ancestors del admin', () => {
    const h = Object.fromEntries(
      securityHeaders({ NODE_ENV: 'production', HERMES_CSP_ENFORCE: '1' }, { preview: true }).map((x) => [x.key, x.value]),
    );
    expect(h['Content-Security-Policy']).toContain(`frame-ancestors 'self' https://hermes.pow.la https://admin.pow.la;`);
    expect(h['Content-Security-Policy']).toContain('script-src');
    expect(h['X-Frame-Options']).toBeUndefined();
  });
});

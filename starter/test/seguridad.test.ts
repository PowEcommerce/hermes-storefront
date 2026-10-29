import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '../lib/redirects';
import { solapasDe } from '../lib/solapas';
import { contentSecurityPolicy, securityHeaders } from '../lib/security-headers';

describe('solapasDe (HTML del backoffice en la PDP)', () => {
  it('sanitiza el HTML: sin <script>, sin on*, sin javascript:', () => {
    const [s] = solapasDe([
      {
        position: 1,
        title: 'Guía de talles',
        html: '<p onclick="alert(1)">Hola<script>alert(1)</script></p><img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a>',
      },
    ]);
    expect(s.title).toBe('Guía de talles');
    expect(s.html).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(s.html).toContain('<p>Hola</p>');
  });
  it('conserva el formato y los iframes permitidos', () => {
    const [s] = solapasDe([
      { position: '2', title: 'Video', html: '<strong>ok</strong><iframe src="https://www.youtube.com/embed/x"></iframe>' },
    ]);
    expect(s.position).toBe(2);
    expect(s.html).toContain('<strong>ok</strong>');
    expect(s.html).toContain('src="https://www.youtube.com/embed/x"');
  });
  it('descarta las que quedan vacías después de sanitizar o no tienen título', () => {
    expect(solapasDe([{ title: 'X', html: '<script>alert(1)</script>' }, { title: ' ', html: '<p>a</p>' }])).toEqual([]);
    expect(solapasDe(null)).toEqual([]);
  });
});

describe('destinoSeguro (?volver=…)', () => {
  it('deja pasar rutas internas con query y hash', () => {
    expect(destinoSeguro('/cuenta')).toBe('/cuenta');
    expect(destinoSeguro('/producto/remera?color=3#talles')).toBe('/producto/remera?color=3#talles');
  });
  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    '\\\\evil.com',
    '/%09/evil.com'.replace('%09', '\t'),
    '/\n/evil.com',
    '/\u0000evil',
    'javascript:alert(1)',
    'cuenta',
    '',
  ])('rechaza %j', (v) => {
    expect(destinoSeguro(v)).toBe('/cuenta');
  });
  it('null/undefined → fallback', () => {
    expect(destinoSeguro(null)).toBe('/cuenta');
    expect(destinoSeguro(undefined, '/')).toBe('/');
  });
});

describe('securityHeaders', () => {
  const porKey = (env: Record<string, string | undefined>) =>
    Object.fromEntries(securityHeaders(env).map((h) => [h.key, h.value]));

  it('nosniff, Referrer-Policy, X-Frame-Options y CSP en Report-Only por defecto', () => {
    const h = porKey({ NODE_ENV: 'production' });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['Content-Security-Policy-Report-Only']).toBeTruthy();
    expect(h['Content-Security-Policy']).toBeUndefined();
  });
  it('HERMES_CSP_ENFORCE=1 la vuelve obligatoria', () => {
    const h = porKey({ NODE_ENV: 'production', HERMES_CSP_ENFORCE: '1' });
    expect(h['Content-Security-Policy']).toBeTruthy();
    expect(h['Content-Security-Policy-Report-Only']).toBeUndefined();
  });
  it('la CSP permite Next, Mercado Pago, el CDN y la API', () => {
    const csp = contentSecurityPolicy({ NODE_ENV: 'production', HERMES_API_URL: 'https://api.agencia.com/api' });
    const dir = (n: string) => csp.split('; ').find((d) => d.startsWith(`${n} `)) ?? '';
    expect(dir('script-src')).toContain("'unsafe-inline'");
    expect(dir('script-src')).not.toContain("'unsafe-eval'");
    expect(dir('script-src')).toContain('https://*.mercadopago.com');
    expect(dir('img-src')).toContain('https://*.powcdn.com');
    expect(dir('img-src')).toContain('https://*.hermescdn.app');
    expect(dir('connect-src')).toContain('https://api.pow.la');
    expect(dir('connect-src')).toContain('https://api.agencia.com');
    expect(dir('frame-src')).toContain('https://www.youtube.com');
    expect(dir('frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(dir('object-src')).toBe("object-src 'none'");
  });
  it('en dev suma unsafe-eval y el websocket del HMR; hosts extra por env', () => {
    const csp = contentSecurityPolicy({ NODE_ENV: 'development', HERMES_CSP_IMG_HOSTS: 'https://img.marca.com, https://cdn.x.com' });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(csp).toContain('https://img.marca.com https://cdn.x.com');
  });
});

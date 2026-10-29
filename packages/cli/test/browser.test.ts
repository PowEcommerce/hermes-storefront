import { describe, expect, it } from 'vitest';
import { comandoParaAbrir, verificacionConfiable } from '../src/browser';
import { main } from '../src/main';
import { apiFalsa, ctxDePrueba } from './helpers';

describe('verificacionConfiable (verification_uri de hermes login)', () => {
  it('https del admin (hermes.pow.la) o del mismo host que la API: sí', () => {
    expect(verificacionConfiable('https://hermes.pow.la/admin/cli?code=AB-CD', 'https://api.pow.la')?.href).toBe(
      'https://hermes.pow.la/admin/cli?code=AB-CD',
    );
    expect(verificacionConfiable('https://api.ejemplo.test/x', 'https://api.ejemplo.test')).not.toBeNull();
  });
  it.each([
    'http://hermes.pow.la/admin/cli',
    'https://evil.com/admin/cli',
    'https://hermes.pow.la.evil.com/x',
    'https://user:pass@hermes.pow.la/x',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'no es una url',
  ])('rechaza %j', (uri) => {
    expect(verificacionConfiable(uri, 'https://api.pow.la')).toBeNull();
  });
});

describe('comandoParaAbrir', () => {
  it('Windows: rundll32 con la URL como un solo argumento (sin cmd /c start)', () => {
    const url = 'https://hermes.pow.la/admin/cli?code=A&calc.exe';
    expect(comandoParaAbrir(url, 'win32')).toEqual(['rundll32', ['url.dll,FileProtocolHandler', url]]);
  });
  it('macOS y Linux sin shell', () => {
    expect(comandoParaAbrir('https://x.com/', 'darwin')).toEqual(['open', ['https://x.com/']]);
    expect(comandoParaAbrir('http://localhost:3000', 'linux')).toEqual(['xdg-open', ['http://localhost:3000/']]);
  });
  it('sólo http(s)', () => {
    expect(comandoParaAbrir('file:///C:/Windows/System32/calc.exe', 'win32')).toBeNull();
    expect(comandoParaAbrir('javascript:alert(1)', 'darwin')).toBeNull();
    expect(comandoParaAbrir('x', 'linux')).toBeNull();
  });
});

describe('hermes login con una verification_uri de otro host', () => {
  it('muestra el código y el link pero no abre el navegador', async () => {
    const api = apiFalsa((c) => {
      if (c.path === '/api/cli/device/code')
        return {
          body: {
            device_code: 'd',
            user_code: 'BCDF-GHJK',
            verification_uri: 'https://evil.com/cli',
            verification_uri_complete: 'https://evil.com/cli?code=BCDF-GHJK',
            expires_in: 1,
            interval: 1,
          },
        };
      if (c.path === '/api/cli/device/token') return { status: 400, body: { error: 'expired_token' } };
      return undefined;
    });
    const t = await ctxDePrueba(api.fetch, { interactive: true });
    await main(['login'], t.ctx);
    expect(t.abiertos).toEqual([]);
    expect(t.out.join('\n')).toContain('No abro el navegador');
  });
});

describe('cliente de la API', () => {
  it('pide los fetch con redirect: "error" (un 30x no se lleva el Bearer)', async () => {
    const inits: RequestInit[] = [];
    const fetch = (async (_url: string, init: RequestInit = {}) => {
      inits.push(init);
      return new Response(JSON.stringify({ email: 'a@b.c', tenants: [] }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const { HermesApi } = await import('../src/api');
    const t = await ctxDePrueba(fetch);
    await new HermesApi(t.ctx, 'https://api.pow.la', 'hct_x').pedirCodigo('x').catch(() => null);
    expect(inits.length).toBeGreaterThan(0);
    expect(inits.every((i) => i.redirect === 'error')).toBe(true);
  });
});

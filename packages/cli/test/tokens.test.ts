import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { Llamada, SESION, apiFalsa, ctxDePrueba } from './helpers';

const HDT = 'hdt_' + 'c'.repeat(48);

function api() {
  return apiFalsa((c: Llamada) => {
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    const base = '/api/cli/tenants/mimarca';
    if (c.method === 'POST' && c.path === `${base}/runtime-tokens/rotate`)
      return {
        body: {
          success: true,
          project: 'tienda',
          environment: c.body.environment,
          public_token_prefix: 'pst_77777777',
          redeployed: [9],
          previous_tokens_revoked: true,
          warnings: [],
        },
      };
    if (c.method === 'POST' && c.path === `${base}/deploy-tokens`)
      return {
        status: 201,
        body: {
          deploy_token: {
            id: 3,
            project: 'tienda',
            environment: c.body.environment,
            token_prefix: HDT.slice(0, 12),
            created_by: SESION.email,
            created_at: '2026-10-28T12:00:00Z',
            last_used_at: null,
            revoked_at: null,
            token: HDT,
          },
        },
      };
    if (c.method === 'GET' && c.path === `${base}/deploy-tokens`)
      return {
        body: {
          deploy_tokens: [
            { id: 3, project: 'tienda', environment: null, token_prefix: HDT.slice(0, 12), created_by: SESION.email, created_at: '2026-10-28T12:00:00Z', last_used_at: null, revoked_at: null },
          ],
        },
      };
    if (c.method === 'DELETE' && c.path === `${base}/deploy-tokens/3`) return { body: { success: true } };
    if (c.method === 'GET' && c.path === `${base}/tokens`)
      return {
        body: {
          storefront_tokens: [
            { id: 1, name: 'Hermes: tienda · production', token_prefix: 'pst_77777777', kind: 'public', purpose: 'runtime', revoked_at: null, created_by: 'otra agencia/POW', created_at: 'x', own: false },
            { id: 2, name: `tienda · dev · ${SESION.email}`, token_prefix: 'pst_22222222', kind: 'public', purpose: 'dev', revoked_at: null, created_by: SESION.email, created_at: 'x', own: true },
            { id: 4, name: 'viejo', token_prefix: 'pst_44444444', kind: 'public', purpose: null, revoked_at: 'ayer', created_by: SESION.email, created_at: 'x', own: true },
          ],
        },
      };
    if (c.method === 'DELETE' && c.path === `${base}/tokens/2`) return { body: { success: true } };
    return undefined;
  });
}

async function linkeado(opts: { interactive?: boolean; respuestas?: string[] } = {}) {
  const a = api();
  const t = await ctxDePrueba(a.fetch, opts);
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  await mkdir(join(t.cwd, '.hermes'));
  await writeFile(
    join(t.cwd, '.hermes', 'project.json'),
    JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', linked_at: 'x' }),
  );
  return { ...t, api: a };
}

describe('hermes tokens', () => {
  it('rotate sin --runtime: explica que los tuyos son con env pull --rotate', async () => {
    const t = await linkeado();
    expect(await main(['tokens', 'rotate'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/env pull --rotate.*--runtime/);
    expect(t.api.llamadas).toEqual([]);
  });

  it('rotate --runtime: pide --yes sin terminal; rota y cuenta qué re-deployó', async () => {
    const t = await linkeado();
    expect(await main(['tokens', 'rotate', '--runtime'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/--yes/);
    expect(await main(['tokens', 'rotate', '--runtime', '--environment', 'preview', '--yes'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/cli/tenants/mimarca/runtime-tokens/rotate',
      body: { project: 'tienda', environment: 'preview' },
    });
    const out = t.out.join('\n');
    expect(out).toContain('Re-deploy con los nuevos: #9');
    expect(out).toContain('Los anteriores quedaron revocados');
  });

  it('list: de quién es cada uno (tienda, desarrollo, tuyo); revoke <id>', async () => {
    const t = await linkeado();
    expect(await main(['tokens'], t.ctx)).toBe(0);
    const out = t.out.join('\n');
    expect(out).toMatch(/#1 .*tienda publicada \(Hermes\)/);
    expect(out).toMatch(/#2 .*desarrollo .*\(tuyo\)/);
    expect(out).not.toContain('#4');
    expect(await main(['tokens', 'revoke', '2', '--yes'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/cli/tenants/mimarca/tokens/2' });
  });
});

describe('hermes deploy-token', () => {
  it('create muestra el token UNA vez y cómo usarlo en CI', async () => {
    const t = await linkeado();
    expect(await main(['deploy-token', 'create', '--environment', 'production'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/cli/tenants/mimarca/deploy-tokens',
      body: { project: 'tienda', environment: 'production' },
    });
    const out = t.out.join('\n');
    expect(out).toContain(HDT);
    expect(out).toContain('HERMES_DEPLOY_TOKEN');
    expect(out).toContain('UNA sola vez');
  });

  it('create sin --environment = producción y previews; entorno inválido → error', async () => {
    const t = await linkeado();
    expect(await main(['deploy-token', 'create'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.body).toEqual({ project: 'tienda', environment: null });
    expect(await main(['deploy-token', 'create', '--environment', 'qa'], t.ctx)).toBe(1);
  });

  it('list (sin claros) y revoke', async () => {
    const t = await linkeado();
    expect(await main(['deploy-token', 'list'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toMatch(/● #3\s+hdt_cccccccc…\s+tienda\s+prod\+preview/);
    expect(t.out.join('\n')).not.toContain(HDT);
    expect(await main(['deploy-token', 'revoke', '3'], t.ctx)).toBe(1);
    expect(await main(['deploy-token', 'revoke', '3', '--yes'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Token de deploy #3 revocado');
  });
});

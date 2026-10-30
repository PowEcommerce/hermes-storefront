import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aQuienDelegar, cliDelProyecto } from '../src/local';

async function tiendaCon(version: string) {
  const raiz = await mkdtemp(join(tmpdir(), 'hermes-local-'));
  const cli = join(raiz, 'node_modules', '@hermesecommerce', 'cli');
  await mkdir(join(cli, 'dist'), { recursive: true });
  await writeFile(join(cli, 'package.json'), JSON.stringify({ name: '@hermesecommerce/cli', version, bin: { hermes: './dist/index.js' } }));
  await writeFile(join(cli, 'dist', 'index.js'), '');
  await mkdir(join(raiz, 'app', 'producto'), { recursive: true });
  // El bin se devuelve con los symlinks resueltos (en macOS tmpdir es /var → /private/var).
  return { raiz, cli, bin: await realpath(join(cli, 'dist', 'index.js')) };
}

describe('CLI del proyecto (global vs local)', () => {
  it('la encuentra subiendo desde una subcarpeta', async () => {
    const t = await tiendaCon('0.2.0');
    expect(await cliDelProyecto(join(t.raiz, 'app', 'producto'))).toEqual({ bin: t.bin, version: '0.2.0' });
  });

  it('fuera de un proyecto: nada', async () => {
    expect(await cliDelProyecto(await mkdtemp(join(tmpdir(), 'hermes-vacio-')))).toBeNull();
  });

  it('otra versión → delega en la del proyecto', async () => {
    const t = await tiendaCon('0.2.0');
    expect(await aQuienDelegar(['dev'], t.raiz, '/usr/lib/node_modules/@hermesecommerce/cli/dist/index.js', '0.1.0', {})).toEqual({
      bin: t.bin,
      version: '0.2.0',
    });
  });

  it('misma versión, la propia, create o HERMES_CLI_NO_DELEGAR → no delega', async () => {
    const t = await tiendaCon('0.2.0');
    const global = '/usr/lib/node_modules/@hermesecommerce/cli/dist/index.js';
    expect(await aQuienDelegar(['dev'], t.raiz, global, '0.2.0', {})).toBeNull();
    expect(await aQuienDelegar(['dev'], t.raiz, t.bin, '0.1.0', {})).toBeNull();
    expect(await aQuienDelegar(['create', 'x'], t.raiz, global, '0.1.0', {})).toBeNull();
    expect(await aQuienDelegar(['dev'], t.raiz, global, '0.1.0', { HERMES_CLI_NO_DELEGAR: '1' })).toBeNull();
  });

  it('login y logout nunca se delegan (manejan las credenciales de la máquina)', async () => {
    const t = await tiendaCon('0.2.0');
    const global = '/usr/lib/node_modules/@hermesecommerce/cli/dist/index.js';
    expect(await aQuienDelegar(['login'], t.raiz, global, '0.1.0', {})).toBeNull();
    expect(await aQuienDelegar(['login', '--api', 'https://api.pow.la'], t.raiz, global, '0.1.0', {})).toBeNull();
    expect(await aQuienDelegar(['logout'], t.raiz, global, '0.1.0', {})).toBeNull();
    expect(await aQuienDelegar(['whoami'], t.raiz, global, '0.1.0', {})).not.toBeNull();
  });

  it('un bin que (con symlinks resueltos) sale de la raíz del paquete → no delega', async () => {
    const t = await tiendaCon('0.2.0');
    const global = '/usr/lib/node_modules/@hermesecommerce/cli/dist/index.js';
    // bin con ../ afuera del paquete
    const afuera = join(t.raiz, 'malo.js');
    await writeFile(afuera, '');
    await writeFile(join(t.cli, 'package.json'), JSON.stringify({ name: '@hermesecommerce/cli', version: '0.2.0', bin: { hermes: '../../../malo.js' } }));
    expect(await cliDelProyecto(t.raiz)).toBeNull();
    expect(await aQuienDelegar(['dev'], t.raiz, global, '0.1.0', {})).toBeNull();
    // dist/link.js que es un symlink afuera del paquete
    await writeFile(join(t.cli, 'package.json'), JSON.stringify({ name: '@hermesecommerce/cli', version: '0.2.0', bin: { hermes: './dist/link.js' } }));
    await symlink(afuera, join(t.cli, 'dist', 'link.js'));
    expect(await cliDelProyecto(t.raiz)).toBeNull();
  });

  it('otro paquete en esa carpeta (name distinto) → no delega', async () => {
    const t = await tiendaCon('0.2.0');
    await writeFile(join(t.cli, 'package.json'), JSON.stringify({ name: 'otro', version: '0.2.0', bin: { hermes: './dist/index.js' } }));
    expect(await cliDelProyecto(t.raiz)).toBeNull();
  });

  it('paquete instalado con symlink (pnpm): el bin real queda dentro de la raíz real → delega', async () => {
    const real = await tiendaCon('0.2.0');
    const raiz = await mkdtemp(join(tmpdir(), 'hermes-pnpm-'));
    await mkdir(join(raiz, 'node_modules', '@hermesecommerce'), { recursive: true });
    await symlink(real.cli, join(raiz, 'node_modules', '@hermesecommerce', 'cli'));
    expect(await cliDelProyecto(raiz)).toEqual({ bin: real.bin, version: '0.2.0' });
  });
});

describe('hermes create', () => {
  const registry = (latest: unknown, status = 200) =>
    apiFalsaDeRegistry((path) => (path === '/-/package/@hermesecommerce%2fcreate-store/dist-tags' ? { status, body: { latest } } : undefined));

  it('delega en create-store con la versión EXACTA de la latest (nunca un rango que npx resuelva con su caché)', async () => {
    const { main } = await import('../src/main');
    const { ctxDePrueba } = await import('./helpers');
    const api = registry('0.4.2');
    const t = await ctxDePrueba(api.fetch, { codigos: [0] });
    expect(await main(['create', 'mi-marca', '--no-install', '--pm', 'pnpm', '--help'], t.ctx)).toBe(0);
    expect([t.procesos[0].cmd, ...t.procesos[0].args]).toEqual([
      'npx',
      '--yes',
      '--prefer-online',
      '@hermesecommerce/create-store@0.4.2',
      'mi-marca',
      '--no-install',
      '--pm',
      'pnpm',
      '--help',
    ]);
    expect(api.llamadas).toEqual(['/-/package/@hermesecommerce%2fcreate-store/dist-tags']);
  });

  it('sin red, con otra major o con basura en latest: la mínima conocida', async () => {
    const { main } = await import('../src/main');
    const { ctxDePrueba } = await import('./helpers');
    const { CREATE_STORE_MINIMA } = await import('../src/commands/create');
    for (const api of [registry('1.0.0'), registry('0.9.0-beta.1'), registry(null, 500), apiFalsaDeRegistry(() => { throw new Error('sin red'); })]) {
      const t = await ctxDePrueba(api.fetch);
      expect(await main(['create', 'x'], t.ctx)).toBe(0);
      expect(t.procesos[0].args.slice(0, 3)).toEqual(['--yes', '--prefer-online', `@hermesecommerce/create-store@${CREATE_STORE_MINIMA}`]);
    }
  });

  it('HERMES_CREATE_STORE_BIN: el generador local, sin preguntar a npm', async () => {
    const { main } = await import('../src/main');
    const { ctxDePrueba } = await import('./helpers');
    const api = registry('0.4.2');
    const t = await ctxDePrueba(api.fetch, { codigos: [3] });
    t.ctx.env = { HERMES_CREATE_STORE_BIN: '/repo/create/dist/index.js' };
    expect(await main(['create', 'x'], t.ctx)).toBe(3);
    expect([t.procesos[0].cmd, ...t.procesos[0].args]).toEqual(['node', '/repo/create/dist/index.js', 'x']);
    expect(api.llamadas).toEqual([]);
  });

  it('avisa (sin fallar) con un Node no soportado, y el generador no lo repite', async () => {
    const { main } = await import('../src/main');
    const { ctxDePrueba } = await import('./helpers');
    const t = await ctxDePrueba(registry('0.4.2').fetch);
    t.ctx.nodeVersion = '23.7.0';
    expect(await main(['create', 'x'], t.ctx)).toBe(0);
    expect(t.err.join('\n')).toContain('Estás con Node 23.7.0; recomendamos Node 22 LTS (o 20/24)');
    expect(t.procesos[0].env.HERMES_NODE_AVISADO).toBe('1');

    const t2 = await ctxDePrueba(registry('0.4.2').fetch);
    expect(await main(['create', 'x'], t2.ctx)).toBe(0);
    expect(t2.err).toEqual([]);
    expect(t2.procesos[0].env.HERMES_NODE_AVISADO).toBeUndefined();
  });
});

/** fetch falso del registry de npm: registra los paths pedidos. */
function apiFalsaDeRegistry(handler: (path: string) => { status?: number; body: unknown } | undefined) {
  const llamadas: string[] = [];
  const fetch = (async (url: string) => {
    const u = new URL(url);
    llamadas.push(u.pathname);
    const r = handler(u.pathname) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, llamadas };
}

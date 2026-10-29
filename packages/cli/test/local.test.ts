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
  it('delega en @hermesecommerce/create-store con las mismas opciones (o en el local de HERMES_CREATE_STORE_BIN)', async () => {
    const { main } = await import('../src/main');
    const { ctxDePrueba, apiFalsa } = await import('./helpers');
    const t = await ctxDePrueba(apiFalsa(() => undefined).fetch, { codigos: [0, 3] });
    expect(await main(['create', 'mi-marca', '--no-install', '--pm', 'pnpm', '--help'], t.ctx)).toBe(0);
    expect([t.procesos[0].cmd, ...t.procesos[0].args]).toEqual([
      'npx',
      '--yes',
      '@hermesecommerce/create-store@^0',
      'mi-marca',
      '--no-install',
      '--pm',
      'pnpm',
      '--help',
    ]);
    t.ctx.env = { HERMES_CREATE_STORE_BIN: '/repo/create/dist/index.js' };
    expect(await main(['create', 'x'], t.ctx)).toBe(3);
    expect([t.procesos[1].cmd, ...t.procesos[1].args]).toEqual(['node', '/repo/create/dist/index.js', 'x']);
  });
});

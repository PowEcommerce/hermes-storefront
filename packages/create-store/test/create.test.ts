import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CreateError,
  VERSIONES_PUBLICADAS,
  type Ctx,
  ajustarPackageJson,
  binLocal,
  crear,
  detectarPm,
  nombreDePaquete,
} from '../src/create';
import { NPMRC_TIENDA, copiarTemplate, seCopia } from '../src/template';

const STARTER = fileURLToPath(new URL('../../../starter', import.meta.url));

/** Un template chico que imita al starter (con todo lo que NO se tiene que copiar). */
async function templateFalso() {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-tpl-'));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'hermes-store',
      version: '9.9.9',
      description: 'starter',
      dependencies: { '@hermesecommerce/storefront': 'file:../packages/storefront', next: '16.4.3' },
      devDependencies: { '@hermesecommerce/cli': 'file:../packages/cli' },
    }),
  );
  await writeFile(join(dir, '_gitignore'), 'node_modules\n.env\n');
  await writeFile(join(dir, '.env.example'), 'HERMES_TENANT=\n');
  await writeFile(join(dir, '.env'), 'HERMES_PRIVATE_TOKEN=psk_x\n');
  await writeFile(join(dir, '.env.local'), 'X=1\n');
  await writeFile(join(dir, '.npmrc'), 'install-links=true\n');
  await writeFile(join(dir, 'package-lock.json'), '{}');
  await mkdir(join(dir, 'app'), { recursive: true });
  await writeFile(join(dir, 'app', 'page.tsx'), 'export default () => null;\n');
  for (const d of ['node_modules/x', '.next/cache', '.hermes']) await mkdir(join(dir, d), { recursive: true });
  await writeFile(join(dir, '.hermes', 'project.json'), '{}');
  return dir;
}

async function ctxDePrueba(opts: { respuestas?: string[]; interactive?: boolean; env?: Ctx['env']; codigos?: number[] } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'hermes-create-'));
  const out: string[] = [];
  const err: string[] = [];
  const corridas: { cmd: string; args: string[]; cwd: string }[] = [];
  const respuestas = [...(opts.respuestas ?? [])];
  const codigos = [...(opts.codigos ?? [])];
  const ctx: Ctx = {
    cwd,
    env: { HERMES_CONFIG_DIR: join(cwd, 'sin-cli'), ...(opts.env ?? {}) },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: opts.interactive ?? false,
    ask: async (p) => {
      out.push(p);
      return respuestas.shift() ?? '';
    },
    run: async (cmd, args, o) => {
      corridas.push({ cmd, args, cwd: o.cwd });
      return codigos.shift() ?? 0;
    },
    templateDir: await templateFalso(),
  };
  return { ctx, out, err, corridas, cwd };
}

async function loguearCli(dir: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'credentials.json'),
    JSON.stringify({ sessions: { 'https://api.pow.la': { token: 'hct_x', expires_at: new Date(Date.now() + 86400e3).toISOString() } } }),
  );
}

describe('create-store', () => {
  it('copia el template sin secretos ni builds, pone el nombre y la versión publicada del SDK', async () => {
    const { ctx, corridas, cwd, out } = await ctxDePrueba();
    expect(await crear(['Mi Tienda'], ctx)).toBe(0);
    const dest = join(cwd, 'Mi Tienda');
    const archivos = (await readdir(dest)).sort();
    expect(archivos).toEqual(['.env.example', '.gitignore', '.npmrc', 'app', 'package.json']);
    // el .npmrc es el de la tienda (legacy-peer-deps por npm 10), no el del repo (install-links)
    const npmrc = await readFile(join(dest, '.npmrc'), 'utf8');
    expect(npmrc).toMatch(/^legacy-peer-deps=true$/m);
    expect(npmrc).not.toContain('install-links');
    const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('mi-tienda');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.private).toBe(true);
    expect(pkg.description).toBeUndefined();
    expect(pkg.dependencies['@hermesecommerce/storefront']).toBe(VERSIONES_PUBLICADAS['@hermesecommerce/storefront']);
    expect(pkg.dependencies.next).toBe('16.4.3');
    expect(pkg.devDependencies['@hermesecommerce/cli']).toBe(VERSIONES_PUBLICADAS['@hermesecommerce/cli']);
    expect(await readFile(join(dest, '.gitignore'), 'utf8')).toContain('.env');
    // instala con npm y sugiere link + dev
    expect(corridas).toEqual([{ cmd: 'npm', args: ['install'], cwd: dest }]);
    const texto = out.join('\n');
    expect(texto).toContain('cd Mi Tienda');
    // recorrido con la CLI global (sin npx) y la alternativa local
    for (const paso of ['hermes login', 'hermes link', 'hermes dev', 'hermes deploy', 'hermes domains add'])
      expect(texto).toContain(`  ${paso}`);
    expect(texto).not.toMatch(/npx (--yes )?@hermesecommerce\/cli (link|dev)/);
    expect(texto).toContain('npm install -g @hermesecommerce/cli');
    expect(texto).toContain('`npm run hermes -- <comando>`, `npm run dev` y `npm run deploy`');
    expect(texto).toContain('`npx @hermesecommerce/cli@^0 <comando>`');
    expect(texto).not.toMatch(/npx (--yes |--no )?hermes\b/);
    expect(texto).not.toContain('  npm install');
  });

  it('--no-install: no corre nada e imprime el install con el gestor que se usó', async () => {
    const { ctx, corridas, out } = await ctxDePrueba({ env: { npm_config_user_agent: 'pnpm/9.0.0 node/v22' } });
    expect(await crear(['tienda', '--no-install'], ctx)).toBe(0);
    expect(corridas).toEqual([]);
    expect(out.join('\n')).toContain('pnpm install');
  });

  it('si falla el install, avisa y lo deja en los próximos pasos', async () => {
    const { ctx, err, out } = await ctxDePrueba({ codigos: [1] });
    expect(await crear(['tienda', '--pm', 'yarn'], ctx)).toBe(0);
    expect(err.join('\n')).toContain('`yarn install` salió con 1');
    expect(err.join('\n')).not.toContain('edgesOut');
    expect(out.join('\n')).toContain('yarn install');
  });

  it('si falla `npm install`, sugiere actualizar npm por el error de edgesOut (npm 10)', async () => {
    const { ctx, err } = await ctxDePrueba({ codigos: [1] });
    expect(await crear(['tienda'], ctx)).toBe(0);
    expect(err.join('\n')).toContain('`npm install` salió con 1');
    expect(err.join('\n')).toContain('Si ves `edgesOut`, actualizá npm (`npm i -g npm@latest`)');
  });

  it('el template publicado lleva _npmrc y la tienda lo recibe como .npmrc', async () => {
    const tpl = await templateFalso();
    const publicado = join(await mkdtemp(join(tmpdir(), 'hermes-pub-')), 'template');
    await copiarTemplate(tpl, publicado, { gitignoreComo: '_gitignore' });
    const enPaquete = await readdir(publicado);
    expect(enPaquete).toEqual(expect.arrayContaining(['_gitignore', '_npmrc']));
    expect(enPaquete).not.toContain('.npmrc');
    expect(await readFile(join(publicado, '_npmrc'), 'utf8')).toBe(NPMRC_TIENDA);

    const { ctx, cwd } = await ctxDePrueba();
    ctx.templateDir = publicado;
    await crear(['tienda', '--no-install'], ctx);
    const archivos = await readdir(join(cwd, 'tienda'));
    expect(archivos).toEqual(expect.arrayContaining(['.gitignore', '.npmrc']));
    expect(archivos).not.toContain('_npmrc');
    expect(await readFile(join(cwd, 'tienda', '.npmrc'), 'utf8')).toMatch(/^legacy-peer-deps=true$/m);
  });

  /** El install falso deja la CLI del proyecto en node_modules (como el install de verdad). */
  function conInstallDeLaCli(t: Awaited<ReturnType<typeof ctxDePrueba>>) {
    const run = t.ctx.run;
    t.ctx.run = async (cmd, args, o) => {
      if (args[0] === 'install') {
        await mkdir(join(o.cwd, 'node_modules', '@hermesecommerce', 'cli'), { recursive: true });
        await writeFile(join(o.cwd, 'node_modules', '@hermesecommerce', 'cli', 'package.json'), '{}');
        await mkdir(join(o.cwd, 'node_modules', '.bin'), { recursive: true });
        await writeFile(binLocal(o.cwd), '');
      }
      return run(cmd, args, o);
    };
    return t;
  }

  it('con la CLI logueada ofrece `hermes link` y lo corre con la CLI instalada en el proyecto', async () => {
    const pre = conInstallDeLaCli(await ctxDePrueba({ interactive: true, respuestas: [''] }));
    await loguearCli(pre.ctx.env.HERMES_CONFIG_DIR!);
    expect(await crear(['tienda'], pre.ctx)).toBe(0);
    expect(pre.corridas.map((c) => [c.cmd, ...c.args].join(' '))).toEqual(['npm install', `${binLocal(pre.cwd + '/tienda')} link`]);
    const texto = pre.out.join('\n');
    expect(texto).not.toContain('  hermes link');
    expect(texto).not.toContain('  hermes login');
    expect(texto).toContain('  hermes dev');
  });

  it('con pnpm, `hermes link` también usa el binario del proyecto (node_modules/.bin)', async () => {
    const pre = conInstallDeLaCli(await ctxDePrueba({ env: { npm_config_user_agent: 'pnpm/9.0.0 node/v22' } }));
    await loguearCli(pre.ctx.env.HERMES_CONFIG_DIR!);
    expect(await crear(['tienda', '--link'], pre.ctx)).toBe(0);
    expect(pre.corridas.map((c) => [c.cmd, ...c.args].join(' '))).toEqual(['pnpm install', `${binLocal(pre.cwd + '/tienda')} link`]);
    expect(pre.out.join('\n')).toContain('`pnpm hermes <comando>`, `pnpm dev` y `pnpm deploy`');
  });

  it('--no-install --link: linkea con la CLI publicada (no hay node_modules)', async () => {
    const pre = await ctxDePrueba();
    await loguearCli(pre.ctx.env.HERMES_CONFIG_DIR!);
    expect(await crear(['tienda', '--no-install', '--link'], pre.ctx)).toBe(0);
    expect(pre.corridas.map((c) => [c.cmd, ...c.args].join(' '))).toEqual(['npx --yes @hermesecommerce/cli@^0 link']);
  });

  it('si el install no dejó la CLI del proyecto, linkea con la publicada', async () => {
    const pre = await ctxDePrueba({ interactive: true, respuestas: ['s'] });
    await loguearCli(pre.ctx.env.HERMES_CONFIG_DIR!);
    await crear(['tienda'], pre.ctx);
    expect(pre.corridas.map((c) => [c.cmd, ...c.args].join(' '))).toEqual(['npm install', 'npx --yes @hermesecommerce/cli@^0 link']);
  });

  it('con la CLI logueada y "n", no linkea', async () => {
    const pre = await ctxDePrueba({ interactive: true, respuestas: ['n'] });
    await loguearCli(pre.ctx.env.HERMES_CONFIG_DIR!);
    await crear(['tienda'], pre.ctx);
    expect(pre.corridas).toHaveLength(1);
    expect(pre.out.join('\n')).toContain('  hermes link');
  });

  it('sin CLI logueada no pregunta nada (aunque sea interactivo)', async () => {
    const pre = await ctxDePrueba({ interactive: true });
    await crear(['tienda'], pre.ctx);
    expect(pre.out.join('\n')).not.toContain('¿Linkeo');
  });

  it('sin carpeta y sin terminal: mi-tienda; con terminal: pregunta', async () => {
    const a = await ctxDePrueba({ codigos: [0] });
    await crear(['--no-install'], a.ctx);
    expect(await readdir(a.cwd)).toContain('mi-tienda');
    const b = await ctxDePrueba({ interactive: true, respuestas: ['la-tienda'] });
    await crear(['--no-install'], b.ctx);
    expect(await readdir(b.cwd)).toContain('la-tienda');
  });

  it('no pisa una carpeta con cosas', async () => {
    const { ctx, cwd } = await ctxDePrueba();
    await mkdir(join(cwd, 'ocupada'));
    await writeFile(join(cwd, 'ocupada', 'x.txt'), 'x');
    await expect(crear(['ocupada'], ctx)).rejects.toThrow(CreateError);
  });

  it('opciones inválidas', async () => {
    const { ctx } = await ctxDePrueba();
    await expect(crear(['--pm', 'maven'], ctx)).rejects.toThrow(/--pm/);
    await expect(crear(['--nada'], ctx)).rejects.toThrow(/desconocida/);
  });
});

describe('helpers', () => {
  it('detectarPm por user agent', () => {
    expect(detectarPm({})).toBe('npm');
    expect(detectarPm({ npm_config_user_agent: 'yarn/4.1.0 npm/? node/v22' })).toBe('yarn');
    expect(detectarPm({ npm_config_user_agent: 'bun/1.1.0' })).toBe('bun');
  });

  it('nombreDePaquete', () => {
    expect(nombreDePaquete('/x/Tienda Ñandú!')).toBe('tienda-nandu');
    expect(nombreDePaquete('/x/___')).toBe('mi-tienda');
  });

  it('seCopia', () => {
    expect(seCopia('.env')).toBe(false);
    expect(seCopia('.env.production')).toBe(false);
    expect(seCopia('.env.example')).toBe(true);
    expect(seCopia('node_modules/a/b.js')).toBe(false);
    expect(seCopia('app/.next/x')).toBe(false);
    expect(seCopia('app/page.tsx')).toBe(true);
    expect(seCopia('tsconfig.tsbuildinfo')).toBe(false);
  });

  it('un file: sin versión publicada conocida falla (no se publica una tienda rota)', () => {
    expect(() => ajustarPackageJson({ dependencies: { otro: 'file:../otro' } }, 'x')).toThrow(/versión publicada/);
  });

  it('las versiones publicadas coinciden con los paquetes del repo', async () => {
    const sdk = JSON.parse(await readFile(new URL('../../storefront/package.json', import.meta.url), 'utf8'));
    expect(VERSIONES_PUBLICADAS[sdk.name]).toBe(`^${sdk.version}`);
    const cli = JSON.parse(await readFile(new URL('../../cli/package.json', import.meta.url), 'utf8'));
    expect(VERSIONES_PUBLICADAS[cli.name]).toBe(`^${cli.version}`);
  });

  it('el starter real del repo: sus file: tienen versión publicada y no se copia nada privado', async () => {
    const pkg = JSON.parse(await readFile(join(STARTER, 'package.json'), 'utf8'));
    expect(() => ajustarPackageJson(pkg, 'x')).not.toThrow();
    // la CLI viaja como devDependency (versión fija por proyecto) y los scripts no se llaman a sí mismos
    expect(ajustarPackageJson(pkg, 'x').devDependencies['@hermesecommerce/cli']).toBe(VERSIONES_PUBLICADAS['@hermesecommerce/cli']);
    expect(pkg.scripts).toMatchObject({ dev: 'hermes dev', 'dev:next': 'next dev', build: 'next build', start: 'next start', deploy: 'hermes deploy' });
    const { ctx, cwd } = await ctxDePrueba();
    ctx.templateDir = STARTER;
    await crear(['real', '--no-install'], ctx);
    const archivos = await readdir(join(cwd, 'real'));
    for (const prohibido of ['node_modules', '.next', '.env', '_npmrc', 'package-lock.json', '.hermes'])
      expect(archivos).not.toContain(prohibido);
    // .npmrc sí, pero el de la tienda: el del starter (install-links) no se copia
    const npmrc = await readFile(join(cwd, 'real', '.npmrc'), 'utf8');
    expect(npmrc).toMatch(/^legacy-peer-deps=true$/m);
    expect(npmrc).not.toContain('install-links');
    // el starter del repo también lo usa (CI con npm 10)
    expect(await readFile(join(STARTER, '.npmrc'), 'utf8')).toMatch(/^legacy-peer-deps=true$/m);
    expect(archivos).toEqual(expect.arrayContaining(['app', 'lib', 'components', 'README.md', '.gitignore', '.env.example']));
  });
});

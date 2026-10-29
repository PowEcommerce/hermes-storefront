import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { carpetaLibre, copiarTemplate, existe } from './template';

export const VERSION = '0.2.0';

/** Templates: `demo` (diseño completo, lindo y vendible) y `skeleton` (mínimo, para arrancar de cero). */
export const TEMPLATES = ['demo', 'skeleton'] as const;
export type Template = (typeof TEMPLATES)[number];
export const TEMPLATE_POR_DEFECTO: Template = 'demo';

/** Carpeta de cada template en la raíz del repo (sin publicar). */
export const CARPETA_EN_EL_REPO: Record<Template, string> = { demo: 'starter-demo', skeleton: 'starter' };

/**
 * Versiones publicadas de los paquetes que el starter usa con `file:` dentro
 * del repo. Un test verifica que coincidan con packages/{storefront,cli}/package.json.
 */
export const VERSIONES_PUBLICADAS: Record<string, string> = {
  '@hermesecommerce/storefront': '^0.1.0',
  '@hermesecommerce/cli': '^0.2.0',
};

/** Major de una versión ("^0.1.0" → 0). */
const major = (v: string) => Number(/(\d+)/.exec(v)?.[1] ?? '0');

/**
 * La CLI que corre `npx` cuando no está instalada en la tienda: fijada a la
 * major que pide el template (`@hermesecommerce/cli@^0`), nunca "lo último que
 * haya" en npm.
 */
export const CLI_NPX = `@hermesecommerce/cli@^${major(VERSIONES_PUBLICADAS['@hermesecommerce/cli'])}`;

export type Pm = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Todo lo de afuera, inyectable para los tests. */
export interface Ctx {
  cwd: string;
  env: Record<string, string | undefined>;
  out: (l: string) => void;
  err: (l: string) => void;
  interactive: boolean;
  ask: (pregunta: string) => Promise<string>;
  /** Corre un comando heredando la terminal; devuelve el código de salida. */
  run: (cmd: string, args: string[], opts: { cwd: string }) => Promise<number>;
  /**
   * Carpeta del template (pisa la elección de --template; para los tests).
   * Default: ./templates/<template> publicado, o el de la raíz del repo.
   */
  templateDir?: string;
  /** Carpeta con un subdirectorio por template (`demo/`, `skeleton/`); para los tests. */
  templatesDir?: string;
}

export class CreateError extends Error {}

const AYUDA = `create-store ${VERSION} — crea una tienda headless de Hermes

Uso: npm create @hermesecommerce/store [carpeta] [-- opciones]
  o: hermes create [carpeta] [opciones]   (con la CLI instalada: npm install -g @hermesecommerce/cli)

  --template <demo|skeleton>  demo: tienda con diseño completo (default)
                      skeleton: lo mínimo, para armar tu diseño de cero
  --no-install        No instalar dependencias (imprime los comandos)
  --pm <npm|pnpm|yarn|bun>  Gestor de paquetes (default: el que corrió el comando)
  --link / --no-link  Correr (o no) \`hermes link\` al terminar sin preguntar
  --help              Esta ayuda
`;

interface Opciones {
  carpeta?: string;
  install: boolean;
  pm?: Pm;
  link?: boolean;
  template?: Template;
  help: boolean;
}

export function parsear(argv: string[]): Opciones {
  const o: Opciones = { install: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--no-install') o.install = false;
    else if (a === '--install') o.install = true;
    else if (a === '--link') o.link = true;
    else if (a === '--no-link') o.link = false;
    else if (a === '--template' || a === '-t' || a.startsWith('--template=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!TEMPLATES.includes(v as Template))
        throw new CreateError(`--template: "${v ?? ''}" no es ${TEMPLATES.join(' ni ')}`);
      o.template = v as Template;
    } else if (a === '--pm' || a.startsWith('--pm=')) {
      const v = a.includes('=') ? a.slice(5) : argv[++i];
      if (!['npm', 'pnpm', 'yarn', 'bun'].includes(v ?? ''))
        throw new CreateError(`--pm: "${v ?? ''}" no es npm, pnpm, yarn ni bun`);
      o.pm = v as Pm;
    } else if (a.startsWith('--')) throw new CreateError(`Opción desconocida: ${a}`);
    else if (!o.carpeta) o.carpeta = a;
    else throw new CreateError(`Sobra el argumento "${a}"`);
  }
  return o;
}

/** El gestor que corrió `npm create` / `pnpm create` / `yarn create` / `bun create`. */
export function detectarPm(env: Ctx['env']): Pm {
  const ua = env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

/** Nombre de paquete válido a partir del nombre de la carpeta. */
export function nombreDePaquete(carpeta: string): string {
  const n = basename(carpeta)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[-]+$/g, '')
    .slice(0, 214);
  return n || 'mi-tienda';
}

/**
 * El binario `hermes` que instaló la tienda (devDependency @hermesecommerce/cli),
 * por su ruta en node_modules/.bin. Nunca `npx hermes`: fuera de un proyecto con
 * la CLI instalada, eso baja y ejecuta el paquete `hermes` de npm, que es de un tercero.
 */
export function binLocal(destino: string, plataforma: NodeJS.Platform = process.platform): string {
  return join(destino, 'node_modules', '.bin', plataforma === 'win32' ? 'hermes.cmd' : 'hermes');
}

/** Cómo corre la tienda su CLI sin la global: el script `"hermes": "hermes"` del package.json. */
const hermesLocal = (pm: Pm) =>
  pm === 'npm' ? 'npm run hermes -- ' : pm === 'bun' ? 'bun run hermes ' : `${pm} hermes `;
const correr = (pm: Pm, script: string) => (pm === 'npm' || pm === 'bun' ? `${pm} run ${script}` : `${pm} ${script}`);

/** ¿La CLI `hermes` tiene alguna sesión guardada? (mismo archivo que usa @hermesecommerce/cli) */
export async function cliLogueada(env: Ctx['env']): Promise<boolean> {
  const dir = env.HERMES_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'hermes');
  try {
    const j = JSON.parse(await readFile(join(dir, 'credentials.json'), 'utf8')) as {
      sessions?: Record<string, { expires_at?: string }>;
    };
    return Object.values(j.sessions ?? {}).some((s) => !s.expires_at || Date.parse(s.expires_at) > Date.now());
  } catch {
    return false;
  }
}

async function templatePorDefecto(t: Template): Promise<string> {
  const publicado = fileURLToPath(new URL(`../templates/${t}`, import.meta.url));
  if (await existe(join(publicado, 'package.json'))) return publicado;
  // Dentro del repo (sin publicar): packages/create-store/dist → ../../../<carpeta>
  const repo = fileURLToPath(new URL(`../../../${CARPETA_EN_EL_REPO[t]}`, import.meta.url));
  if (await existe(join(repo, 'package.json'))) return repo;
  throw new CreateError(`No encuentro el template ${t}.`);
}

/** Qué template usar: el de --template; si no, se pregunta (con terminal) o va el demo. */
export async function elegirTemplate(o: { template?: Template }, ctx: Pick<Ctx, 'interactive' | 'ask'>): Promise<Template> {
  if (o.template) return o.template;
  if (!ctx.interactive) return TEMPLATE_POR_DEFECTO;
  const r = (
    await ctx.ask(
      '¿Con qué template?\n  1) demo      tienda con diseño completo, lista para mostrar (recomendado)\n  2) skeleton  lo mínimo, para armar tu diseño de cero\nElegí [1]: ',
    )
  )
    .trim()
    .toLowerCase();
  if (r === '2' || r === 'skeleton') return 'skeleton';
  return TEMPLATE_POR_DEFECTO;
}

/** package.json de la tienda nueva: su nombre y los paquetes de Hermes con la versión de npm. */
export function ajustarPackageJson(pkg: Record<string, any>, nombre: string): Record<string, any> {
  const out: Record<string, any> = { ...pkg, name: nombre, version: '0.1.0', private: true };
  delete out.description;
  for (const campo of ['dependencies', 'devDependencies'] as const) {
    if (!out[campo]) continue;
    out[campo] = { ...out[campo] };
    for (const [dep, v] of Object.entries(out[campo] as Record<string, string>)) {
      if (typeof v === 'string' && v.startsWith('file:')) {
        const publicada = VERSIONES_PUBLICADAS[dep];
        if (!publicada) throw new CreateError(`${dep} usa ${v} y no tiene versión publicada conocida.`);
        out[campo][dep] = publicada;
      }
    }
  }
  return out;
}

export async function crear(argv: string[], ctx: Ctx): Promise<number> {
  const o = parsear(argv);
  if (o.help) {
    ctx.out(AYUDA);
    return 0;
  }

  let carpeta = o.carpeta;
  if (!carpeta && ctx.interactive) carpeta = (await ctx.ask('¿Cómo se llama la carpeta de la tienda? (mi-tienda) ')) || 'mi-tienda';
  if (!carpeta) carpeta = 'mi-tienda';
  const destino = resolve(ctx.cwd, carpeta);
  if (!(await carpetaLibre(destino)))
    throw new CreateError(`La carpeta ${carpeta} ya existe y no está vacía. Elegí otro nombre.`);

  const nombre = nombreDePaquete(destino);
  const pm = o.pm ?? detectarPm(ctx.env);
  const elegido = await elegirTemplate(o, ctx);
  const template = ctx.templateDir ?? (ctx.templatesDir ? join(ctx.templatesDir, elegido) : await templatePorDefecto(elegido));

  ctx.out(`\nCreando la tienda (template ${elegido}) en ${destino}…`);
  await copiarTemplate(template, destino);
  const pkgPath = join(destino, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, any>;
  await writeFile(pkgPath, `${JSON.stringify(ajustarPackageJson(pkg, nombre), null, 2)}\n`);
  ctx.out(`✔ Template ${elegido} copiado (${nombre}).`);

  let instalado = false;
  if (o.install) {
    ctx.out(`\nInstalando dependencias con ${pm}…`);
    const code = await ctx.run(pm, ['install'], { cwd: destino });
    instalado = code === 0;
    if (!instalado) {
      ctx.err(`⚠ \`${pm} install\` salió con ${code}: corrélo a mano dentro de ${carpeta}.`);
      if (pm === 'npm') ctx.err('  Si ves `edgesOut`, actualizá npm (`npm i -g npm@latest`).');
    }
  }

  const cd = carpeta === '.' ? null : `cd ${carpeta}`;
  const logueada = await cliLogueada(ctx.env);
  let linkeado = false;
  // Con dependencias instaladas, `hermes link` sale de la CLI del proyecto
  // (devDependency); con --no-install y --link, de la publicada.
  if (logueada && (instalado || o.link === true)) {
    let correrLink = o.link;
    if (correrLink === undefined && ctx.interactive) {
      const r = (await ctx.ask('\nTenés la CLI de Hermes logueada. ¿Linkeo la tienda a una marca ahora (`hermes link`)? [S/n] '))
        .trim()
        .toLowerCase();
      correrLink = r === '' || ['s', 'si', 'sí', 'y', 'yes'].includes(r);
    }
    if (correrLink) {
      // La CLI del proyecto por su ruta; si el install no la dejó, la publicada
      // por su nombre completo y versión (@hermesecommerce/cli@^0), nunca `hermes` a secas.
      const bin = binLocal(destino);
      const local =
        (await existe(join(destino, 'node_modules', '@hermesecommerce', 'cli', 'package.json'))) && (await existe(bin));
      const [cmd, args]: [string, string[]] = local ? [bin, ['link']] : ['npx', ['--yes', CLI_NPX, 'link']];
      const code = await ctx.run(cmd, args, { cwd: destino });
      linkeado = code === 0;
      if (!linkeado) ctx.err('⚠ `hermes link` no terminó bien: corrélo de nuevo dentro de la carpeta.');
    }
  }

  ctx.out('\n✔ Listo. Próximos pasos:\n');
  const pasos: string[] = [];
  if (cd) pasos.push(cd);
  if (!instalado) pasos.push(`${pm} install`);
  if (!logueada) pasos.push('hermes login                     # una vez por máquina (abre el navegador)');
  if (!linkeado) pasos.push('hermes link                      # elegís la marca → tokens HERMES_* en .env');
  pasos.push('hermes dev                       # la tienda en http://localhost:3000');
  pasos.push('hermes deploy                    # publicar en el hosting de Hermes');
  pasos.push('hermes domains add <tu-dominio>  # o desde el admin de la marca');
  for (const p of pasos) ctx.out(`  ${p}`);
  ctx.out(
    `\n¿Sin la CLI global? \`npm install -g @hermesecommerce/cli\` (una vez), o usá la que trae la tienda: ` +
      `\`${hermesLocal(pm)}<comando>\`, \`${correr(pm, 'dev')}\` y \`${correr(pm, 'deploy')}\`. ` +
      `Fuera de la tienda: \`npx ${CLI_NPX} <comando>\` (no instales el paquete \`hermes\` de npm: es de un tercero).`,
  );
  ctx.out('Guía: README.md de la tienda.\n');
  return 0;
}

export function ctxReal(): Ctx {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    cwd: process.cwd(),
    env: process.env,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    interactive,
    ask: async (pregunta) => {
      if (!interactive) return '';
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await rl.question(pregunta)).trim();
      } finally {
        rl.close();
      }
    },
    run: (cmd, args, { cwd }) =>
      new Promise((res) => {
        const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
        p.on('error', () => res(127));
        p.on('close', (code) => res(code ?? 1));
      }),
  };
}

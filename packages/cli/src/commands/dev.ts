import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Parsed, str } from '../args';
import { Ctx, USER_AGENT } from '../context';
import { VARIABLES_HERMES, leerEnv, leerVariable } from '../env-file';
import { CliError } from '../errors';
import { Proyecto, leerProyecto } from '../project';
import { confirmar, conSesion } from './common';
import { archivoEnv, problemasDeTokens } from './link';
import { Ejecucion, Paquete, conCadena, cortarSiHayBucle, errorDeScriptsFaltantes, resolverPaso } from '../scripts';

export type Pm = 'npm' | 'pnpm' | 'yarn' | 'bun';

const LOCKFILES: [string, Pm][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

async function existe(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** El gestor de paquetes del proyecto, por su lockfile (default npm). */
export async function detectarPm(cwd: string): Promise<Pm> {
  for (const [archivo, pm] of LOCKFILES) if (await existe(join(cwd, archivo))) return pm;
  return 'npm';
}

/** Correr un binario del proyecto con su gestor (npx / pnpm exec / yarn / bunx). */
export function exec(pm: Pm, args: string[]): [string, string[]] {
  if (pm === 'pnpm') return ['pnpm', ['exec', ...args]];
  if (pm === 'yarn') return ['yarn', args];
  if (pm === 'bun') return ['bunx', args];
  return ['npx', ['--no', ...args]];
}

/** El comando para un paso: `npm run <script>` o, si el script es la propia CLI, `npx --no next <paso>`. */
function comandoDe(pm: Pm, e: Ejecucion): [string, string[]] {
  return e.tipo === 'script' ? [pm, ['run', e.script]] : exec(pm, ['next', ...e.args]);
}

const describir = ([cmd, args]: [string, string[]]) => `${cmd} ${args.join(' ')}`;

async function paqueteDelProyecto(cwd: string, comando: string): Promise<Paquete> {
  try {
    return JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as Paquete;
  } catch {
    throw new CliError(`No hay package.json en esta carpeta: corré \`hermes ${comando}\` en la raíz de tu storefront.`);
  }
}

function puerto(flags: Parsed['flags']): number {
  const v = str(flags.port) ?? '3000';
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CliError(`--port: "${v}" no es un puerto válido`);
  return n;
}

const entornoDe = (apiUrl: string) => (/\/\/api\.pow\.la/.test(apiUrl) ? 'producción' : 'otra API');

/**
 * Todo lo que `dev` y `preview` verifican antes de levantar nada: proyecto
 * linkeado, tokens vigentes, scripts y dependencias.
 */
async function preparar(ctx: Ctx, flags: Parsed['flags'], comando: 'dev' | 'preview', pasos: Paso[]) {
  cortarSiHayBucle(ctx.env, comando);
  const p = await leerProyecto(ctx.cwd);
  if (!p)
    throw new CliError(
      'Esta carpeta no está linkeada a una marca (no hay .hermes/project.json). Corré `hermes link` primero.',
    );

  const pkg = await paqueteDelProyecto(ctx.cwd, comando);
  const resueltas = pasos.map(([paso, candidatos]) => resolverPaso(pkg, paso, candidatos, comando));
  const faltan = pasos.filter((_, i) => !resueltas[i]);
  if (faltan.length) throw errorDeScriptsFaltantes(faltan);
  const ejecuciones = resueltas as Ejecucion[];

  const archivo = archivoEnv(flags);
  const env = await leerEnv(ctx.cwd, archivo);
  if (flags.check === false) {
    ctx.err('⚠ Sin verificar los tokens (--no-check).');
  } else {
    const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
    const problemas = await problemasDeTokens(cliente, p, env, archivo);
    if (problemas.length) {
      for (const x of problemas) ctx.err(`  ✘ ${x}`);
      throw new CliError(
        'Los tokens del .env no están al día. Arreglalo con `hermes env pull --rotate` (tus tokens de desarrollo nuevos) o `hermes link` (otra marca/proyecto).',
      );
    }
  }

  const pm = await detectarPm(ctx.cwd);
  if (!(await existe(join(ctx.cwd, 'node_modules')))) {
    if (!ctx.interactive && flags.yes !== true)
      throw new CliError(`Faltan las dependencias: corré \`${pm} install\` (o pasá --yes para que las instale la CLI).`);
    const instalar =
      flags.yes === true || (await confirmar(ctx, `Faltan las dependencias. ¿Las instalo con \`${pm} install\`?`, true));
    if (!instalar) throw new CliError(`Faltan las dependencias: corré \`${pm} install\`.`);
    const code = await ctx.spawn(pm, ['install'], { cwd: ctx.cwd, env: ctx.env });
    if (code !== 0) throw new CliError(`\`${pm} install\` salió con ${code}.`, code);
  }

  // Las HERMES_* del .env (o --env-file) van al proceso. Las de la terminal mandan sobre el archivo.
  const hermes: Record<string, string> = {};
  for (const k of VARIABLES_HERMES) {
    const v = leerVariable(env, k);
    if (v !== undefined && v !== '') hermes[k] = v;
  }
  return { p, pm, hermes, ejecuciones };
}

/** Un link de categoría para el banner (best effort: si la API no contesta, no hay). */
async function unaCategoria(ctx: Ctx, apiUrl: string, hermes: Record<string, string>): Promise<string | null> {
  try {
    const base = apiUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
    if (hermes.HERMES_TENANT) headers['X-Client-ID'] = hermes.HERMES_TENANT;
    if (hermes.HERMES_PUBLIC_TOKEN) headers['X-Storefront-Token'] = hermes.HERMES_PUBLIC_TOKEN;
    const r = await ctx.fetch(`${base}/api/v2/categories/header`, {
      headers,
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { categories?: { slug?: string | null }[] };
    return j.categories?.find((c) => c.slug)?.slug ?? null;
  } catch {
    return null;
  }
}

async function banner(ctx: Ctx, p: Proyecto, hermes: Record<string, string>, url: string, modo: string) {
  const apiUrl = hermes.HERMES_API_URL ?? `${p.api}/api`;
  const cat = await unaCategoria(ctx, apiUrl, hermes);
  const lineas = [
    '',
    `  Hermes ${modo} · ${p.project_name}`,
    '',
    `  Local:    ${url}`,
    `  Marca:    ${hermes.HERMES_TENANT ?? p.tenant}`,
    `  Entorno:  ${entornoDe(apiUrl)} (${apiUrl})`,
    '',
    `  Inicio:     ${url}/`,
    ...(cat ? [`  Categoría:  ${url}/categoria/${cat}`] : []),
    `  Carrito:    ${url}/carrito`,
    '',
  ];
  for (const l of lineas) ctx.out(l);
}

/** Espera a que el server conteste y abre el navegador (hasta ~60 s). */
async function abrirCuandoAnde(ctx: Ctx, url: string, terminado: () => boolean) {
  for (let i = 0; i < 120 && !terminado(); i++) {
    try {
      await ctx.fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
      await ctx.openBrowser(url);
      return;
    } catch {
      await ctx.sleep(500);
    }
  }
}

async function servir(ctx: Ctx, flags: Parsed['flags'], comando: [string, string[]], url: string, env: Record<string, string | undefined>) {
  let listo = false;
  const [cmd, args] = comando;
  const fin = ctx.spawn(cmd, args, { cwd: ctx.cwd, env }).then((c) => {
    listo = true;
    return c;
  });
  if (flags.open) void abrirCuandoAnde(ctx, url, () => listo);
  const code = await fin;
  // 130 = Ctrl+C: no es un error.
  if (code !== 0 && code !== 130) throw new CliError(`\`${describir(comando)}\` salió con ${code}.`, code);
}

type Paso = ['dev' | 'build' | 'start', string[]];

/**
 * `hermes dev`: el server de desarrollo del proyecto con las HERMES_* inyectadas.
 * Corre "dev:next" (el `next dev` crudo del starter) o, en proyectos viejos,
 * "dev". Si "dev" es la propia CLI y no hay "dev:next", corre `next dev`.
 */
export async function dev(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const port = puerto(flags);
  const { p, pm, hermes, ejecuciones } = await preparar(ctx, flags, 'dev', [['dev', ['dev:next', 'dev']]]);
  const url = `http://localhost:${port}`;
  await banner(ctx, p, hermes, url, 'dev');
  const env = conCadena({ ...hermes, ...ctx.env, PORT: String(port) }, 'dev');
  await servir(ctx, flags, comandoDe(pm, ejecuciones[0]), url, env);
}

/** `hermes preview`: build de producción + start local, con las mismas verificaciones. */
export async function preview(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const port = puerto(flags);
  const { p, pm, hermes, ejecuciones } = await preparar(ctx, flags, 'preview', [
    ['build', ['build']],
    ['start', ['start']],
  ]);
  const env = conCadena({ ...hermes, ...ctx.env, NODE_ENV: 'production' }, 'preview');
  const build = comandoDe(pm, ejecuciones[0]);
  ctx.out(`Build de producción (\`${describir(build)}\`)…`);
  const code = await ctx.spawn(build[0], build[1], { cwd: ctx.cwd, env });
  if (code !== 0) throw new CliError(`El build falló (\`${describir(build)}\` salió con ${code}).`, code);
  const url = `http://localhost:${port}`;
  await banner(ctx, p, hermes, url, 'preview');
  await servir(ctx, flags, comandoDe(pm, ejecuciones[1]), url, { ...env, PORT: String(port) });
}

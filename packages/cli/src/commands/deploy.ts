import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Deployment, GitDelDeploy, HermesApi, PedidoDeDeploy } from '../api';
import { Parsed, str } from '../args';
import {
  OPEN_NEXT_CONFIG,
  WRANGLER_JSONC,
  assetsDe,
  branchDeGit,
  leerConfigWrangler,
  modulosDelWorker,
} from '../bundle';
import { API_DEFAULT, Ctx, VERSION } from '../context';
import { normalizarApi } from '../credentials';
import { VARIABLES_HERMES, ignorarEnGit, leerEnv, leerVariable, todasLasVariables } from '../env-file';
import { CliError } from '../errors';
import { Proyecto, leerProyecto } from '../project';
import { Pasos, bytes, cantidad, cola, duracion, guardarLog, modoDeSalida, sinAnsi, taparSecretos } from '../salida';
import { conCadena, cortarSiHayBucle, invocaHermes } from '../scripts';
import { confirmar, conSesion } from './common';
import { Pm, detectarPm, exec } from './dev';
import { archivoEnv } from './link';

/** Dónde deja `wrangler deploy --dry-run` el worker empaquetado. */
export const OUTDIR = join('.hermes', 'build', 'worker');

/** Versiones que instala la CLI si el proyecto no las tiene. */
const OPENNEXT = '@opennextjs/cloudflare@^1';
const WRANGLER = 'wrangler@^4';

async function existe(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function agregarDev(pm: Pm, pkgs: string[]): [string, string[]] {
  if (pm === 'pnpm') return ['pnpm', ['add', '-D', ...pkgs]];
  if (pm === 'yarn') return ['yarn', ['add', '-D', ...pkgs]];
  if (pm === 'bun') return ['bun', ['add', '-d', ...pkgs]];
  return ['npm', ['install', '-D', ...pkgs]];
}

/** Proyecto linkeado y en Next.js (por ahora `hermes deploy` es OpenNext). */
async function proyectoDeploy(ctx: Ctx): Promise<Proyecto> {
  const p = await leerProyecto(ctx.cwd);
  if (!p)
    throw new CliError('Esta carpeta no está linkeada a una marca (no hay .hermes/project.json). Corré `hermes link` primero.');
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(join(ctx.cwd, 'package.json'), 'utf8'));
  } catch {
    throw new CliError('No hay package.json en esta carpeta: corré `hermes deploy` en la raíz de tu storefront.');
  }
  if (!pkg.dependencies?.next && !pkg.devDependencies?.next)
    throw new CliError(
      '`hermes deploy` por ahora despliega proyectos Next.js (con @opennextjs/cloudflare). Para otro framework, deployá en tu hosting y usá `hermes link --domain`.',
    );
  // OpenNext corre el script "build" del proyecto: si ese script es la CLI, sería un bucle.
  const build = pkg.scripts?.build;
  if (invocaHermes(build))
    throw new CliError(
      `El script "build" (\`${build}\`) llama a la CLI de Hermes, y \`hermes deploy\` lo corre para buildear (vía @opennextjs/cloudflare): sería un bucle. ` +
        'Dejalo como "build": "next build" y usá "deploy": "hermes deploy" para publicar.',
    );
  return p;
}

/** open-next.config.ts + wrangler.jsonc: los crea si faltan (como en el starter). */
async function asegurarConfig(ctx: Ctx, sal: Salida): Promise<void> {
  const creados: string[] = [];
  if (!(await existe(join(ctx.cwd, 'open-next.config.ts')))) {
    await writeFile(join(ctx.cwd, 'open-next.config.ts'), OPEN_NEXT_CONFIG);
    creados.push('open-next.config.ts');
  }
  if (!(await existe(join(ctx.cwd, 'wrangler.jsonc'))) && !(await existe(join(ctx.cwd, 'wrangler.json')))) {
    await writeFile(join(ctx.cwd, 'wrangler.jsonc'), WRANGLER_JSONC);
    creados.push('wrangler.jsonc');
  }
  if (creados.length) sal.pasos.nota(`  Creé ${creados.join(' y ')} (config de @opennextjs/cloudflare para el hosting de Hermes).`);
}

/** Flags para que la instalación no muestre avisos (engines, deprecated, audit, fund). */
function silencioso(pm: Pm): string[] {
  return pm === 'npm' ? ['--silent', '--no-audit', '--no-fund'] : ['--silent'];
}

/** @opennextjs/cloudflare y wrangler en devDependencies (los instala si faltan, con OK). */
async function asegurarHerramientas(ctx: Ctx, pm: Pm, flags: Parsed['flags'], sal: Salida): Promise<void> {
  const faltan: string[] = [];
  if (!(await existe(join(ctx.cwd, 'node_modules', '@opennextjs', 'cloudflare')))) faltan.push(OPENNEXT);
  if (!(await existe(join(ctx.cwd, 'node_modules', 'wrangler')))) faltan.push(WRANGLER);
  if (!faltan.length) {
    await sal.pasos.paso('Revisando las herramientas de build', async () => {}, () => 'Herramientas de build listas');
    return;
  }
  const [cmd, args] = agregarDev(pm, faltan);
  const linea = `${cmd} ${args.join(' ')}`;
  if (!ctx.interactive && flags.yes !== true)
    throw new CliError(`Faltan las herramientas del build: corré \`${linea}\` (o pasá --yes para que las instale la CLI).`);
  if (flags.yes !== true && !(await confirmar(ctx, `Para el build hacen falta ${faltan.join(' y ')}. ¿Las instalo (\`${linea}\`)?`, true)))
    throw new CliError(`Cancelado: instalalas con \`${linea}\`.`);
  const conFlags = sal.pasos.modo === 'verbose' ? args : [...args, ...silencioso(pm)];
  await sal.pasos.paso(
    'Instalando las herramientas de build',
    () => correr(ctx, sal, cmd, conFlags, ctx.env, 'La instalación de las herramientas de build'),
    () => `Herramientas de build instaladas (${faltan.map((f) => f.replace(/@\^\d+$/, '')).join(', ')})`,
  );
}

/**
 * Lo que necesita la salida de un deploy: los pasos en pantalla y la salida
 * cruda de los procesos (para el log, si algo falla).
 */
interface Salida {
  pasos: Pasos;
  /** La salida cruda de cada proceso, en orden (sin tapar todavía). */
  log: string[];
  /** Valores exactos a tapar en el log y en la cola (secretos del .env y del proyecto). */
  secretos: string[];
}

/** Un proceso del deploy que salió con error: lleva su salida para mostrar la cola. */
class FalloDeProceso extends CliError {
  constructor(
    message: string,
    readonly salida: string,
    code: number,
  ) {
    super(message, code);
  }
}

/**
 * Corre un proceso del deploy. Por default, sin mostrar su salida (queda en
 * el log); con --verbose, heredando la terminal (como antes).
 */
async function correr(
  ctx: Ctx,
  sal: Salida,
  cmd: string,
  args: string[],
  env: Record<string, string | undefined>,
  que: string,
): Promise<void> {
  const linea = `${cmd} ${args.join(' ')}`;
  const t0 = Date.now();
  let code: number;
  let output = '';
  if (sal.pasos.modo === 'verbose' || !ctx.run) {
    code = await ctx.spawn(cmd, args, { cwd: ctx.cwd, env });
    output = '(la salida fue a la terminal)\n';
  } else ({ code, output } = await ctx.run(cmd, args, { cwd: ctx.cwd, env }));
  sal.log.push(`$ ${linea}\n${output}${output.endsWith('\n') ? '' : '\n'}→ salió con ${code} (${duracion(Date.now() - t0)})\n`);
  if (code !== 0) throw new FalloDeProceso(`${que} falló (\`${linea}\` salió con ${code}).`, output, code);
}

/**
 * Las rutas de la tienda, del manifest que deja `next build` (las mismas que
 * la tabla de Next, sin las internas). null si no está.
 */
async function rutasDelBuild(cwd: string): Promise<number | null> {
  const rutas = new Set<string>();
  const leer = async (rel: string) => {
    try {
      return JSON.parse(await readFile(join(cwd, rel), 'utf8')) as Record<string, string>;
    } catch {
      return null;
    }
  };
  const app = await leer(join('.next', 'app-path-routes-manifest.json'));
  const pages = await leer(join('.next', 'server', 'pages-manifest.json'));
  if (!app && !pages) return null;
  for (const r of Object.values(app ?? {})) if (r !== '/_global-error') rutas.add(r);
  for (const r of Object.keys(pages ?? {})) if (!['/_app', '/_document', '/_error', '/404', '/500'].includes(r)) rutas.add(r);
  return rutas.size || null;
}

/** Las variables que NUNCA entran al build: van sólo como secretos del worker. */
export const SECRETAS = ['HERMES_PRIVATE_TOKEN', 'HERMES_REVALIDATE_SECRET'] as const;

/**
 * El env de los procesos del build: las variables del .env (para el prerender
 * y las NEXT_PUBLIC_*) MENOS las secretas, y nada de Cloudflare (la CLI nunca
 * usa un token de Cloudflare; wrangler --dry-run no lo necesita).
 */
function envDelBuild(ctx: Ctx, delArchivo: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...delArchivo, ...ctx.env };
  for (const k of Object.keys(env)) if (/^(CLOUDFLARE|CF)_/.test(k)) delete env[k];
  for (const k of SECRETAS) delete env[k];
  // El token de deploy (CI) tampoco: no es del build.
  delete env.HERMES_DEPLOY_TOKEN;
  // Sin telemetría de wrangler, salvo que la hayas configurado vos.
  if (!env.WRANGLER_SEND_METRICS) env.WRANGLER_SEND_METRICS = 'false';
  env.NODE_ENV = 'production';
  return env;
}

/** Dónde quedan los .env* mientras corre el build. */
export const APARTADOS = join('.hermes', 'build', 'env-apartado');

/**
 * Los archivos .env* que el build compilaría en el worker
 * (@opennextjs/cloudflare los mete en `next-env.mjs`): los de la raíz salvo
 * `.env.example`, más `--env-file` si es otro.
 */
async function archivosEnv(cwd: string, archivo: string): Promise<string[]> {
  const raiz = (await readdir(cwd)).filter((f) => /^\.env(\..+)?$/.test(f) && f !== '.env.example');
  const otro = relative(cwd, join(cwd, archivo));
  // Sin .env (p. ej. en CI) no hay nada que apartar.
  const conOtro = !otro.startsWith('..') && (await existe(join(cwd, otro))) ? [otro] : [];
  return [...new Set([...raiz, ...conOtro])];
}

/** Devuelve a su lugar los .env* apartados (también los de un build que se cortó). */
async function restaurarEnv(ctx: Ctx): Promise<void> {
  const dir = join(ctx.cwd, APARTADOS);
  // Recorrido propio (readdir recursive pide Node 18.17+).
  const lista: string[] = [];
  const recorrer = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await recorrer(p);
      else if (e.isFile()) lista.push(relative(dir, p));
    }
  };
  try {
    await recorrer(dir);
  } catch {
    return;
  }
  for (const rel of lista) {
    const desde = join(dir, rel);
    let hasta = join(ctx.cwd, rel);
    // Si alguien creó otro con el mismo nombre mientras tanto, no se pisa.
    if (await existe(hasta)) {
      hasta = `${hasta}.hermes-backup`;
      ctx.err(`  ⚠ ${rel} ya existía: dejé el tuyo de antes en ${basename(hasta)}`);
    }
    await mkdir(dirname(hasta), { recursive: true });
    await rename(desde, hasta);
  }
  await rm(dir, { recursive: true, force: true });
}

/**
 * Corre `fn` con los .env* apartados: así el build no compila los secretos
 * en el worker (verificado con @opennextjs/cloudflare). Siempre los devuelve.
 */
async function sinEnvEnElBuild<T>(ctx: Ctx, archivo: string, fn: () => Promise<T>): Promise<T> {
  await restaurarEnv(ctx); // un build anterior que se cortó
  const apartados = await archivosEnv(ctx.cwd, archivo);
  try {
    for (const rel of apartados) {
      const hasta = join(ctx.cwd, APARTADOS, rel);
      await mkdir(dirname(hasta), { recursive: true });
      await rename(join(ctx.cwd, rel), hasta);
    }
    return await fn();
  } finally {
    await restaurarEnv(ctx);
  }
}

/**
 * Valores secretos que no pueden aparecer en el código empaquetado: si
 * aparecen, el deploy se corta (y hay que rotarlos).
 */
async function secretosEnElCodigo(rutas: string[], secretos: string[]): Promise<string[]> {
  const valores = secretos.filter((v) => v && v.length >= 8);
  if (!valores.length) return [];
  const hallados: string[] = [];
  for (const r of rutas) {
    const txt = (await readFile(r)).toString('latin1');
    if (valores.some((v) => txt.includes(v))) hallados.push(r);
  }
  return hallados;
}

/** El build de OpenNext (`next build` adentro). Devuelve las rutas, si se saben. */
async function compilar(ctx: Ctx, sal: Salida, pm: Pm, env: Record<string, string | undefined>): Promise<number | null> {
  return sal.pasos.paso(
    'Compilando la tienda',
    async () => {
      const [cmd, args] = exec(pm, ['opennextjs-cloudflare', 'build']);
      await correr(ctx, sal, cmd, args, env, 'El build de la tienda');
      return rutasDelBuild(ctx.cwd);
    },
    (n) => (n ? `Tienda compilada (${cantidad(n)} rutas)` : 'Tienda compilada'),
  );
}

/** El empaquetado del worker con wrangler (sin deployar ni hablar con Cloudflare). */
async function empaquetar(ctx: Ctx, sal: Salida, pm: Pm, env: Record<string, string | undefined>): Promise<void> {
  await rm(join(ctx.cwd, OUTDIR), { recursive: true, force: true });
  const [cmd, args] = exec(pm, ['wrangler', 'deploy', '--dry-run', '--outdir', OUTDIR]);
  await correr(ctx, sal, cmd, args, env, 'El empaquetado del worker');
}

/**
 * Si algo falla: la cola de la salida del proceso (sin ruido ni secretos) y
 * el log completo en .hermes/logs/. Devuelve el error con eso sumado.
 */
async function conLog(ctx: Ctx, sal: Salida, e: CliError): Promise<CliError> {
  if (!sal.log.length || sal.pasos.modo === 'verbose') return e;
  const tapar = (t: string) => taparSecretos(t, sal.secretos);
  const partes = [e.message];
  if (e instanceof FalloDeProceso && e.salida) {
    const ultimas = cola(tapar(e.salida), 30);
    if (ultimas.length) partes.push('', '  Últimas líneas:', ...ultimas.map((l) => `    ${l}`));
  }
  try {
    await ignorarEnGit(ctx.cwd, '.hermes/logs/');
    const encabezado = `hermes deploy (CLI ${VERSION}) · ${new Date().toISOString()}\n\n`;
    const ruta = await guardarLog(ctx.cwd, 'deploy', tapar(encabezado + sinAnsi(sal.log.join('\n'))));
    partes.push('', `  Log completo: ${ruta}`, '  Para ver la salida en vivo: hermes deploy --verbose');
  } catch {
    partes.push('', '  (No pude guardar el log: corré `hermes deploy --verbose` para ver todo.)');
  }
  e.message = partes.join('\n');
  return e;
}

/**
 * La API y el cliente del deploy: con `HERMES_DEPLOY_TOKEN` (CI) no hace
 * falta `hermes login`; si no, la sesión de la CLI.
 */
async function clienteDeDeploy(
  ctx: Ctx,
  flags: Parsed['flags'],
  p: Proyecto,
): Promise<{ cliente: HermesApi; conDeployToken: boolean }> {
  const token = ctx.env.HERMES_DEPLOY_TOKEN?.trim();
  if (token) {
    if (!token.startsWith('hdt_'))
      throw new CliError('HERMES_DEPLOY_TOKEN no es un token de deploy (hdt_…): crealo con `hermes deploy-token create`.');
    // El token de CI sólo viaja a la API oficial, salvo que la elijas a mano
    // (--api / HERMES_API): un .hermes/project.json con otra `api` (un PR que
    // lo cambia) no puede llevarse el hdt_.
    const explicita = str(flags.api) ?? ctx.env.HERMES_API?.trim();
    const api = normalizarApi(explicita || p.api);
    if (!explicita && new URL(api).origin !== API_DEFAULT)
      throw new CliError(
        `.hermes/project.json apunta a ${api}, no a ${API_DEFAULT}: con HERMES_DEPLOY_TOKEN no mando el token ahí. ` +
          'Si esa API es la correcta, pasala explícita con `--api <url>` o `HERMES_API`.',
      );
    return { cliente: new HermesApi(ctx, api, token), conDeployToken: true };
  }
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  return { cliente, conDeployToken: false };
}

/** commit, branch y si hay cambios sin commitear; null si no es un repo git. */
export async function gitDelProyecto(ctx: Ctx): Promise<GitDelDeploy | null> {
  if (!ctx.capture) return null;
  const git = (args: string[]) => ctx.capture!('git', args, { cwd: ctx.cwd, env: ctx.env });
  const head = await git(['rev-parse', 'HEAD']).catch(() => ({ code: 1, stdout: '' }));
  const commit = head.stdout.trim().toLowerCase();
  if (head.code !== 0 || !/^[0-9a-f]{7,40}$/.test(commit)) return null;
  const rama = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ code: 1, stdout: '' }));
  let branch: string | null = rama.code === 0 ? rama.stdout.trim() : null;
  // Detached (CI): la branch del PR o la del push.
  if (!branch || branch === 'HEAD') branch = ctx.env.GITHUB_HEAD_REF || ctx.env.GITHUB_REF_NAME || null;
  const st = await git(['status', '--porcelain']).catch(() => ({ code: 1, stdout: '' }));
  return { commit, branch, dirty: st.code === 0 ? st.stdout.trim() !== '' : null };
}

const corto = (c: string) => c.slice(0, 7);

/**
 * Antes de subir: si el deploy activo del entorno (o de la preview de esa
 * branch) es de un commit que NO está en tu HEAD, o si tenés cambios sin
 * commitear, avisa y pide confirmación (`--yes`/`--force` siguen igual).
 */
async function avisarSiPisa(
  ctx: Ctx,
  flags: Parsed['flags'],
  cliente: HermesApi,
  p: Proyecto,
  preview: string | undefined,
  git: GitDelDeploy | null,
): Promise<Deployment | undefined> {
  const avisos: string[] = [];
  if (git?.dirty)
    avisos.push('Tenés cambios sin commitear: se sube tu copia local tal cual (el deploy queda marcado como "con cambios sin commitear").');
  let activo: Deployment | undefined;
  try {
    const ds = (await cliente.deploys(p.tenant, p.project_name, preview ? 'preview' : 'production')).deployments;
    activo = ds.find(
      (d) =>
        d.status === 'active' &&
        (!preview || d.git_branch === preview || d.branch === slugSimple(preview)),
    );
  } catch {
    // Sin el historial no se puede avisar: el deploy sigue.
  }
  if (git?.commit) {
    if (activo?.git_commit && !git.commit.startsWith(activo.git_commit) && !activo.git_commit.startsWith(git.commit)) {
      const r = await ctx.capture!('git', ['merge-base', '--is-ancestor', activo.git_commit, 'HEAD'], {
        cwd: ctx.cwd,
        env: ctx.env,
      }).catch(() => ({ code: 128, stdout: '' }));
      const entorno = preview ? `la preview de ${preview}` : 'producción';
      const quien = `${activo.created_by}, ${fecha(activo.activated_at ?? activo.created_at)}`;
      const deDonde = `commit ${corto(activo.git_commit)}${activo.git_branch ? ` (branch ${activo.git_branch})` : ''}`;
      if (r.code === 1)
        avisos.push(
          `El deploy activo de ${entorno} es de ${quien}, ${deDonde}, y ese commit no está en tu branch. Si deployás, pisás esos cambios.`,
        );
      else if (r.code !== 0)
        avisos.push(
          `El deploy activo de ${entorno} es de ${quien}, ${deDonde}, y ese commit no está en tu copia local: corré \`git fetch\` y fijate si tu branch lo incluye. Si deployás, podés pisar esos cambios.`,
        );
    }
  }
  if (!avisos.length) return activo;
  for (const a of avisos) ctx.err(`⚠ ${a}`);
  if (flags.yes === true || flags.force === true) return activo;
  if (!ctx.interactive) throw new CliError('Para deployar igual sin terminal interactiva, pasá --yes (o --force).');
  if (!(await confirmar(ctx, '¿Deployar igual?'))) throw new CliError('Cancelado: no se subió nada.', 0);
  return activo;
}

/** Como el slug de la branch de la API, para los casos simples. */
const slugSimple = (b: string) =>
  b
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** La ruta del webhook de revalidación, si la tienda la tiene (la del starter). */
const RUTA_REVALIDATE = '/api/hermes/revalidate';
async function rutaDeRevalidacion(cwd: string): Promise<string | undefined> {
  for (const base of ['app', join('src', 'app')])
    for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mjs'])
      if (await existe(join(cwd, base, 'api', 'hermes', 'revalidate', `route.${ext}`))) return RUTA_REVALIDATE;
  return undefined;
}

/** Nombre de branch para la URL de la preview. */
async function branchDePreview(ctx: Ctx, flags: Parsed['flags']): Promise<string> {
  const b = str(flags.branch) ?? (await branchDeGit(ctx.cwd));
  if (!b) throw new CliError('Para una preview pasá --branch <nombre> (no encontré la branch de git).');
  return b;
}

const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR') : '—');

/**
 * `hermes deploy [--preview] [--branch x]`: build + subida al hosting de
 * Hermes (el Cloudflare de Pow). La CLI nunca usa un token de Cloudflare: le
 * manda el build a la API y la API despliega.
 *
 * Salida: pasos propios (spinner en una terminal, una línea por paso en CI);
 * la salida de npm, OpenNext, Next y wrangler queda en un log que se guarda
 * si algo falla. `--verbose` (o HERMES_VERBOSE=1) la muestra cruda; `--json`
 * imprime sólo un JSON al final.
 */
export async function deploy(ctxOriginal: Ctx, { flags }: Parsed): Promise<void> {
  const inicio = Date.now();
  const modo = modoDeSalida(ctxOriginal, flags);
  // --json es para scripts: nunca pregunta (como sin terminal; pasá --yes).
  const ctx: Ctx = modo === 'json' ? { ...ctxOriginal, interactive: false } : ctxOriginal;
  const sal: Salida = { pasos: new Pasos(ctx, modo), log: [], secretos: [] };
  try {
    await deployar(ctx, flags, sal, inicio);
  } catch (e) {
    if (e instanceof CliError && e.code !== 0) throw await conLog(ctx, sal, e);
    throw e;
  }
}

async function deployar(ctx: Ctx, flags: Parsed['flags'], sal: Salida, inicio: number): Promise<void> {
  const { pasos } = sal;
  const { c } = pasos;
  cortarSiHayBucle(ctx.env, 'deploy');
  const p = await proyectoDeploy(ctx);
  const { cliente, conDeployToken } = await clienteDeDeploy(ctx, flags, p);
  const archivo = archivoEnv(flags);
  const envTexto = await leerEnv(ctx.cwd, archivo);
  // Los tokens del .env (personales) NO van a la tienda: sólo se usan para
  // verificar que no queden compilados en el bundle.
  const hermes: Record<string, string> = {};
  for (const k of VARIABLES_HERMES) {
    const v = leerVariable(envTexto, k);
    if (v) hermes[k] = v;
  }
  // Nada de esto puede quedar en el log.
  sal.secretos.push(...Object.values(hermes), ...[ctx.env.HERMES_DEPLOY_TOKEN].filter((v): v is string => Boolean(v)));

  const preview = flags.preview === true;
  const branch = preview ? await branchDePreview(ctx, flags) : undefined;
  const entornoTexto = preview ? `preview de ${branch}` : 'producción';
  pasos.nota(`${c.negrita('Hermes')} · deploy de «${p.project_name}» (${p.tenant} · ${entornoTexto})`);
  // Valores locales de las variables que en Hermes son secretas: no pueden
  // quedar compiladas (se juntan al pedir el entorno del build).
  const secretasLocales: string[] = [];
  const environment = preview ? 'preview' : 'production';
  const git = await gitDelProyecto(ctx);
  const anterior = await avisarSiPisa(ctx, flags, cliente, p, branch, git);
  const pm = await detectarPm(ctx.cwd);

  const ignorar = flags.build !== false ? ['.open-next/', '.wrangler/', '.hermes/build/', '.hermes/logs/'] : ['.hermes/logs/'];
  for (const l of ignorar) if (await ignorarEnGit(ctx.cwd, l)) pasos.nota(`  Agregué ${l} a tu .gitignore.`);

  let rutas: number | null = null;
  let entornoDelBuild: Record<string, string | undefined> | undefined;
  if (flags.build !== false) {
    await asegurarConfig(ctx, sal);
    // La marca, la API y el pst_ de la TIENDA (runtime) para el build: el
    // prerender y lo que el build compile usan el token del proyecto, no el
    // tuyo (y en CI no hace falta un .env).
    const { env: deHermes, vars = {}, secret_names = [] } = await cliente.entornoDeBuild(p.tenant, {
      project: p.project_name,
      environment,
    });
    const delArchivo = todasLasVariables(envTexto);
    const entorno = envDelBuild(ctx, delArchivo);
    // Las variables del proyecto (`hermes env`): las secretas NUNCA entran al
    // build (aunque estén en tu .env o en tu shell: van sólo como secretos del
    // worker); las normales (p. ej. NEXT_PUBLIC_*) pisan las locales.
    for (const k of secret_names) {
      const local = entorno[k];
      if (local) secretasLocales.push(local);
      delete entorno[k];
    }
    sal.secretos.push(...secretasLocales);
    const propias = Object.keys(vars);
    if (propias.length) pasos.nota(`  Variables del proyecto en el build (${environment}): ${propias.join(', ')}`);
    await asegurarHerramientas(ctx, pm, flags, sal);
    entornoDelBuild = conCadena({ ...entorno, ...vars, ...deHermes }, 'deploy');
    const env = entornoDelBuild;
    rutas = await sinEnvEnElBuild(ctx, archivo, () => compilar(ctx, sal, pm, env));
  }

  const { worker, assets, cfg } = await pasos.paso(
    'Armando el paquete',
    async () => {
      if (entornoDelBuild) await sinEnvEnElBuild(ctx, archivo, () => empaquetar(ctx, sal, pm, entornoDelBuild!));
      const cfg = await leerConfigWrangler(ctx.cwd);
      if (!cfg) throw new CliError('Falta wrangler.jsonc (config del build de @opennextjs/cloudflare).');
      const worker = await modulosDelWorker(join(ctx.cwd, OUTDIR), cfg.main);
      const assets = cfg.assetsDir
        ? await assetsDe(join(ctx.cwd, cfg.assetsDir))
        : { manifest: {}, porHash: new Map<string, string>() };
      // Los mismos secretos, en los módulos del worker Y en los assets estáticos
      // (un chunk del cliente en _next/static también es público).
      const filtrados = await secretosEnElCodigo(
        [...worker.modulos.map((m) => m.path), ...assets.porHash.values()],
        [...SECRETAS.map((k) => hermes[k]), ...secretasLocales].filter((v): v is string => Boolean(v)),
      );
      if (filtrados.length)
        throw new CliError(
          `El build tiene tus secretos (HERMES_PRIVATE_TOKEN / HERMES_REVALIDATE_SECRET o una variable secreta del proyecto) compilados en ${filtrados.map((f) => relative(ctx.cwd, f)).join(', ')}. No subí nada. ` +
            'Revisá que tu código no los importe en el bundle ni en el código del cliente (o un .env fuera de la raíz), y como ya estuvieron en disco en el build, rotalos: `hermes env pull --rotate`.',
        );
      return { worker, assets, cfg };
    },
    ({ worker, assets }) =>
      `Paquete armado (worker de ${bytes(worker.modulos.reduce((n, m) => n + m.size, 0))} · ${cantidad(Object.keys(assets.manifest).length)} archivos)`,
  );
  const revalidatePath = await rutaDeRevalidacion(ctx.cwd);
  const nArchivos = Object.keys(assets.manifest).length;
  const bytesWorker = worker.modulos.reduce((n, m) => n + m.size, 0);

  const pedido: PedidoDeDeploy = {
    project: p.project_name,
    environment,
    ...(branch ? { branch } : {}),
    worker: {
      main_module: worker.main,
      compatibility_date: cfg.compatibility_date,
      compatibility_flags: cfg.compatibility_flags,
      modules: worker.modulos.map(({ name, type, size, sha256 }) => ({ name, type, size, sha256 })),
    },
    assets: { manifest: assets.manifest },
    ...(git ? { git } : {}),
    ...(revalidatePath ? { hermes: { revalidate_path: revalidatePath } } : {}),
  };
  const { id, nuevos } = await pasos.paso(
    'Subiendo a Hermes',
    async (avance) => {
      const creado = await cliente.crearDeploy(p.tenant, pedido);
      const total = creado.upload.buckets.reduce((n, b) => n + b.length, 0);
      let subidos = 0;
      for (const bucket of creado.upload.buckets) {
        const form = new FormData();
        for (const hash of bucket) {
          const path = assets.porHash.get(hash);
          if (!path) throw new CliError(`La API pidió un asset que no está en el build (${hash}).`);
          form.append(hash, new Blob([new Uint8Array(await readFile(path))]), hash);
        }
        await cliente.subirAssets(p.tenant, creado.deployment.id, form);
        subidos += bucket.length;
        avance(`Subiendo a Hermes (${cantidad(subidos)}/${cantidad(total)} archivos)`);
      }
      return { id: creado.deployment.id, nuevos: total };
    },
    ({ nuevos }) =>
      nuevos
        ? `Subida a Hermes (${cantidad(nuevos)} de ${cantidad(nArchivos)} archivos nuevos)`
        : `Subida a Hermes (sin archivos nuevos: ${nArchivos === 1 ? 'el único ya estaba' : `los ${cantidad(nArchivos)} ya estaban`})`,
  );

  // Sin secretos: los tokens de la tienda los pone Hermes (los del proyecto).
  const r = await pasos.paso(
    'Publicando',
    async () => {
      const form = new FormData();
      for (const m of worker.modulos) form.append(m.name, new Blob([new Uint8Array(await readFile(m.path))]), m.name);
      return cliente.finalizarDeploy(p.tenant, id, form);
    },
    (r) =>
      r.deployment.status === 'active'
        ? `Publicada en ${duracion(Date.now() - inicio)}`
        : `Deploy #${r.deployment.id} subido (estado: ${r.deployment.status})`,
  );
  const duracionMs = Date.now() - inicio;

  // Los dominios del proyecto (producción). Con un token de deploy la API
  // puede no dejar listarlos: entonces no se muestran.
  let dominios: { hostname: string; status: string }[] = [];
  if (!preview)
    try {
      dominios = (await cliente.dominios(p.tenant)).domains
        .filter((d) => d.project === p.project_name && d.role === 'storefront')
        .map((d) => ({ hostname: d.hostname, status: d.status }));
    } catch {
      // Sin dominios en la salida.
    }

  if (pasos.modo === 'json') {
    ctx.out(
      JSON.stringify(
        {
          ok: true,
          id: r.deployment.id,
          url: r.url,
          status: r.deployment.status,
          tenant: p.tenant,
          project: p.project_name,
          environment,
          branch: branch ?? null,
          commit: git?.commit ?? null,
          dirty: git?.dirty ?? null,
          duration_ms: duracionMs,
          routes: rutas,
          files: { total: nArchivos, uploaded: nuevos, worker_modules: worker.modulos.length, worker_bytes: bytesWorker },
          domains: dominios,
          previous_id: anterior?.id ?? null,
          warnings: r.warnings,
        },
        null,
        2,
      ),
    );
    for (const w of r.warnings) ctx.err(`⚠ ${w}`);
    return;
  }

  const d = c.tenue;
  ctx.out('');
  ctx.out(`🌐 ${c.negrita(c.cian(r.url))}`);
  const detalle = [`Deploy #${r.deployment.id}`];
  if (git?.commit)
    detalle.push(`commit ${corto(git.commit)}${git.branch ? ` (${git.branch})` : ''}${git.dirty ? ' + cambios sin commitear' : ''}`);
  if (conDeployToken) detalle.push('con HERMES_DEPLOY_TOKEN');
  ctx.out(`   ${d(detalle.join(' · '))}`);
  if (dominios.length)
    ctx.out(
      `   Dominios: ${dominios.map((x) => (x.status === 'active' ? x.hostname : `${x.hostname} ${d(`(${x.status === 'error' ? 'con error' : 'pendiente'})`)}`)).join(', ')}`,
    );
  else if (!preview) ctx.out(`   Tu dominio: ${d('hermes domains add www.tu-dominio.com')}`);
  const comandos = preview
    ? [`Logs: hermes logs --preview${flags.branch ? ` --branch ${branch}` : ''}`, 'Variables: hermes env list --environment preview']
    : [
        'Logs: hermes logs',
        'Variables: hermes env list',
        `Volver atrás: hermes rollback ${anterior && anterior.id !== r.deployment.id ? anterior.id : '<id>'}`,
      ];
  ctx.out(`   ${d(comandos.join(' · '))}`);
  for (const w of r.warnings) ctx.err(`${c.amarillo('⚠')} ${w}`);
}

function tabla(ctx: Ctx, ds: Deployment[]) {
  if (!ds.length) {
    ctx.out('Todavía no hay deploys de este proyecto: `hermes deploy`.');
    return;
  }
  for (const d of ds) {
    const marca = d.status === 'active' ? '●' : d.status === 'failed' ? '✘' : d.status === 'deleted' ? '–' : '○';
    const entorno = d.environment === 'production' ? 'prod' : `preview:${d.branch}`;
    const commit = d.git_commit
      ? `${corto(d.git_commit)}${d.git_branch ? ` (${d.git_branch})` : ''}${d.git_dirty ? '*' : ''}`
      : '—';
    ctx.out(
      `${marca} #${d.id}  ${d.status.padEnd(10)} ${entorno.padEnd(24)} ${commit.padEnd(20)} ${fecha(d.activated_at ?? d.created_at)}  ${d.created_by}${d.rollback_of ? `  (versión de #${d.rollback_of})` : ''}`,
    );
    ctx.out(`     ${d.url}`);
    if (d.status === 'failed' && d.error) ctx.out(`     ${d.error}`);
  }
}

/**
 * `hermes deployments rm [--branch x] [--yes]`: borra la preview de una branch
 * (script, URL, ruta y la URL de los dominios del token).
 */
async function borrarPreview(ctx: Ctx, flags: Parsed['flags']): Promise<void> {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await clienteDeDeploy(ctx, flags, p);
  const branch = await branchDePreview(ctx, flags);
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para borrar una preview sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Borrar la preview de "${branch}"? Su URL deja de andar.`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  const r = await cliente.borrarPreview(p.tenant, p.project_name, branch);
  ctx.out(`✔ Preview de "${branch}" borrada (${r.removed.url}).`);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/** `hermes deployments [--json]`: los deploys del proyecto linkeado. `rm`: borra una preview. */
export async function deployments(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  if (positional[1] === 'rm') return borrarPreview(ctx, flags);
  if (positional[1]) throw new CliError(`Uso: hermes deployments [--json] | hermes deployments rm [--branch x]`);
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await clienteDeDeploy(ctx, flags, p);
  const r = await cliente.deploys(p.tenant, p.project_name);
  if (flags.json) {
    ctx.out(JSON.stringify(r.deployments, null, 2));
    return;
  }
  tabla(ctx, r.deployments);
}

/** `hermes rollback <id>`: vuelve a poner en el aire la versión de ese deploy. */
export async function rollback(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const id = Number(positional[1]);
  if (!Number.isInteger(id) || id < 1) throw new CliError('Uso: hermes rollback <id> (los ids salen de `hermes deployments`).');
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para hacer rollback sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Volver a poner en el aire la versión del deploy #${id}?`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  const r = await cliente.rollback(p.tenant, id);
  ctx.out(`✔ Rollback: deploy #${r.deployment.id} (versión de #${id}) en el aire en ${r.url}`);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}


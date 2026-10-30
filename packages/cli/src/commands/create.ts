import { Ctx, USER_AGENT, VERSION } from '../context';
import { VAR_NODE_AVISADO, nodeSoportado } from '../node';

/** El generador de tiendas (`npm create @hermesecommerce/store`). */
export const CREATE_STORE = '@hermesecommerce/create-store';

/**
 * La versión del generador que esta CLI sabe que existe (el template y la CLI
 * que pide la tienda nueva van con ella). Es el piso cuando no se puede
 * preguntar cuál es la última.
 */
export const CREATE_STORE_MINIMA = '0.3.0';

const majorDe = (v: string) => Number(/^(\d+)\./.exec(v)?.[1] ?? NaN);

/**
 * Qué versión EXACTA correr con `npx`. Nunca un rango: con `create-store@^0`,
 * npx reusa la copia que tenga en su caché si cumple el rango, sin mirar npm
 * (en una máquina corría 0.1.1, con el template viejo). Con la versión exacta
 * la caché no puede quedar atrás.
 *
 * Se pregunta la `latest` al registry (dist-tags, una llamada chica) y se usa
 * si es de la misma major que esta CLI (una major nueva, o una publicación
 * comprometida con otra major, no entra sola). Sin red o con otra major: la
 * mínima conocida.
 */
export async function versionDelGenerador(ctx: Ctx): Promise<string> {
  const registry = (ctx.env.npm_config_registry || 'https://registry.npmjs.org/').replace(/\/?$/, '/');
  try {
    const r = await ctx.fetch(`${registry}-/package/${CREATE_STORE.replace('/', '%2f')}/dist-tags`, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const latest = ((await r.json()) as { latest?: unknown }).latest;
      if (
        typeof latest === 'string' &&
        /^\d+\.\d+\.\d+$/.test(latest) &&
        majorDe(latest) === majorDe(VERSION)
      )
        return latest;
    }
  } catch {
    // sin red: la mínima
  }
  return CREATE_STORE_MINIMA;
}

/**
 * Para probar el generador sin publicarlo: ruta a create/dist/index.js
 * (`HERMES_CREATE_STORE_BIN=…/create/dist/index.js hermes create x`).
 */
export const VAR_CREATE_LOCAL = 'HERMES_CREATE_STORE_BIN';

/**
 * `hermes create [carpeta] [opciones]`: lo mismo que `npm create
 * @hermesecommerce/store`, con las mismas opciones (--no-install, --pm,
 * --link/--no-link, --help). Delega en el generador publicado, así la tienda
 * nueva siempre sale del starter más reciente.
 */
export async function create(ctx: Ctx, argv: string[]): Promise<number> {
  const local = ctx.env[VAR_CREATE_LOCAL];
  // Si la CLI ya avisó de la versión de Node, el generador no lo repite.
  const env = nodeSoportado(ctx.nodeVersion ?? process.versions.node) ? ctx.env : { ...ctx.env, [VAR_NODE_AVISADO]: '1' };
  if (local) return ctx.spawn('node', [local, ...argv], { cwd: ctx.cwd, env });
  const version = await versionDelGenerador(ctx);
  return ctx.spawn('npx', ['--yes', '--prefer-online', `${CREATE_STORE}@${version}`, ...argv], { cwd: ctx.cwd, env });
}

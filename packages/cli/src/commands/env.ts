import { ApiError, HermesApi, VariableDeEntorno, esRutaInexistente } from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import { escribirEnv } from '../env-file';
import { CliError } from '../errors';
import { Proyecto, leerProyecto } from '../project';
import { confirmar, conSesion } from './common';
import { archivoEnv } from './link';

/** Las mismas reglas que la API (para fallar antes de ir a la red). */
const NOMBRE = /^[A-Z][A-Z0-9_]{0,63}$/;
const RESERVADAS = /^(HERMES_|CF_|CLOUDFLARE_)/;
const MAX_BYTES = 5 * 1024;

type Entorno = 'production' | 'preview';

export const SIN_ENV_EN_LA_API =
  'La API todavía no tiene `hermes env` (variables de entorno del hosting). Avisale a Pow o probá más tarde.';

/** El 404 de una API vieja, con un mensaje claro. */
function apiVieja(e: unknown): unknown {
  return esRutaInexistente(e) ? new CliError(SIN_ENV_EN_LA_API) : e;
}

function entornoDe(flags: Parsed['flags'], porDefecto: Entorno | null): Entorno | null {
  const e = str(flags.environment) ?? porDefecto;
  if (e !== null && e !== 'production' && e !== 'preview') throw new CliError('--environment: production o preview.');
  return e;
}

async function contexto(ctx: Ctx, flags: Parsed['flags']): Promise<{ p: Proyecto; cliente: HermesApi }> {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  return { p, cliente };
}

/** null si el nombre sirve; si no, el motivo. */
export function problemaDeNombre(nombre: string): string | null {
  if (!NOMBRE.test(nombre))
    return `${nombre || '(vacío)'}: el nombre va en mayúsculas, números y _, empezando con una letra (hasta 64).`;
  if (RESERVADAS.test(nombre) || nombre === 'ASSETS')
    return `${nombre}: es una variable reservada de Hermes o de Cloudflare (HERMES_*, CF_*, CLOUDFLARE_*, ASSETS).`;
  return null;
}

const ENTORNO: Record<Entorno, string> = { production: 'producción', preview: 'previews' };
const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR') : '—');

/** `hermes env list [--environment production|preview] [--json]`. */
export async function envList(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const environment = entornoDe(flags, null) ?? undefined;
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.variables(p.tenant, p.project_name, environment).catch((e) => {
    throw apiVieja(e);
  });
  if (flags.json) {
    ctx.out(JSON.stringify(r.env, null, 2));
    return;
  }
  if (!r.env.length) {
    ctx.out(
      `"${p.project_name}" (${p.tenant}) no tiene variables${environment ? ` en ${ENTORNO[environment]}` : ''}: \`hermes env set NOMBRE=valor\`.`,
    );
    return;
  }
  ctx.out(`Variables de "${p.project_name}" (${p.tenant}):`);
  const ancho = Math.max(...r.env.map((v) => v.name.length));
  for (const v of r.env)
    ctx.out(
      `  ${v.name.padEnd(ancho)}  ${v.environment.padEnd(10)}  ${v.is_secret ? '•••••• (secreta)' : (v.value ?? '')}  — ${v.updated_by ?? '—'}, ${fecha(v.updated_at)}`,
    );
}

/**
 * `hermes env set NOMBRE=valor [--secret] [--environment production|preview]`.
 * No redeploya: se aplica en el próximo `hermes deploy`.
 */
export async function envSet(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const arg = positional[2];
  const igual = arg?.indexOf('=') ?? -1;
  if (!arg || igual < 1)
    throw new CliError('Uso: hermes env set NOMBRE=valor [--secret] [--environment production|preview]');
  const name = arg.slice(0, igual);
  const value = arg.slice(igual + 1);
  const secret = flags.secret === true;
  const environment = entornoDe(flags, 'production')!;
  const problema = problemaDeNombre(name);
  if (problema) throw new CliError(problema);
  if (!value) throw new CliError(`${name}: el valor no puede estar vacío.`);
  if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) throw new CliError(`${name}: el valor pasa de 5 KB.`);
  if (secret && name.startsWith('NEXT_PUBLIC_'))
    throw new CliError(
      `${name}: las NEXT_PUBLIC_* terminan en el código del navegador, no pueden ser secretas. Guardala sin --secret o cambiale el nombre.`,
    );
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente
    .guardarVariable(p.tenant, { project: p.project_name, environment, name, value, secret })
    .catch((e) => {
      throw apiVieja(e);
    });
  ctx.out(
    `✔ ${name} ${r.created ? 'creada' : 'actualizada'}${r.var.is_secret ? ' (secreta)' : ''} en ${ENTORNO[environment]} de "${p.project_name}" (${p.tenant}).`,
  );
  ctx.out(`  Se aplica en el próximo \`hermes deploy${environment === 'preview' ? ' --preview' : ''}\` (no redeploya solo).`);
  if (name.startsWith('NEXT_PUBLIC_'))
    ctx.out('  Es NEXT_PUBLIC_*: Next la compila en el build, así que hace falta un deploy nuevo (un rollback usa la de su build).');
}

/** `hermes env rm NOMBRE [--environment production|preview] [--yes]`. */
export async function envRm(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const name = positional[2];
  if (!name) throw new CliError('Uso: hermes env rm NOMBRE [--environment production|preview]');
  const environment = entornoDe(flags, 'production')!;
  const { p, cliente } = await contexto(ctx, flags);
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para borrar una variable sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Borrar ${name} de ${ENTORNO[environment]} de "${p.project_name}"?`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  await cliente.borrarVariable(p.tenant, name, p.project_name, environment).catch((e) => {
    throw apiVieja(e);
  });
  ctx.out(`✔ ${name} borrada de ${ENTORNO[environment]} de "${p.project_name}".`);
  ctx.out(`  Se aplica en el próximo \`hermes deploy${environment === 'preview' ? ' --preview' : ''}\` (la tienda publicada la sigue teniendo hasta entonces).`);
}

/**
 * Para `hermes env pull`: baja las variables NO secretas del proyecto al
 * .env (para `hermes dev`). Las secretas nunca se bajan (la API no las
 * manda en claro). Sin hosting en el plan o con una API vieja, no hace nada.
 */
export async function bajarVariables(
  ctx: Ctx,
  cliente: HermesApi,
  p: Proyecto,
  flags: Parsed['flags'],
): Promise<void> {
  const environment = entornoDe(flags, 'production')!;
  let env: VariableDeEntorno[];
  try {
    env = (await cliente.variables(p.tenant, p.project_name, environment)).env;
  } catch (e) {
    // Sin la ruta (API vieja), sin hosting en el plan o fuera de producción:
    // el pull de los tokens sigue igual.
    // (el listado nunca da 404 por otra cosa).
    if (e instanceof ApiError && [403, 404, 405, 503].includes(e.status)) return;
    throw e;
  }
  const normales = env.filter((v) => !v.is_secret && v.value !== null && !problemaDeNombre(v.name));
  const secretas = env.filter((v) => v.is_secret);
  if (normales.length) {
    const archivo = archivoEnv(flags);
    await escribirEnv(ctx.cwd, Object.fromEntries(normales.map((v) => [v.name, v.value!])), archivo);
    ctx.out(
      `  Variables del proyecto (${ENTORNO[environment]}) en ${archivo}: ${normales.map((v) => v.name).join(', ')}.`,
    );
  }
  if (secretas.length)
    ctx.out(
      `  Secretas que no se bajan (cargalas a mano en tu .env si las necesitás en local): ${secretas.map((v) => v.name).join(', ')}.`,
    );
}

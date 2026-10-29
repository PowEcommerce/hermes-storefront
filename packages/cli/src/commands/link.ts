import {
  ApiError,
  CUENTA_NO_AUTORIZADA,
  HermesApi,
  LinkResult,
  Me,
  ProyectoDeMarca,
  ProyectosDeMarca,
} from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import {
  VARIABLES_HERMES,
  asegurarGitignore,
  escribirEnv,
  leerEnv,
  leerVariable,
} from '../env-file';
import { CliError } from '../errors';
import {
  Proyecto,
  borrarProyecto,
  guardarProyecto,
  leerProyecto,
  nombrePorDefecto,
  slugDeProyecto,
} from '../project';
import { confirmar, conSesion, elegir } from './common';

export function archivoEnv(flags: Parsed['flags']): string {
  return str(flags['env-file']) ?? '.env';
}

/** Las cuentas de la sesión, para los mensajes ("marca-a, marca-b"). */
const listaDeCuentas = (me: Me) =>
  me.tenants.length ? me.tenants.map((t) => t.tenant).join(', ') : 'ninguna';

/** El 403 `cuenta_no_autorizada` de la API, con la lista y la sugerencia. */
export function errorDeCuenta(e: unknown, me: Me | null): unknown {
  if (!(e instanceof ApiError) || e.body.error !== CUENTA_NO_AUTORIZADA) return e;
  return new CliError(
    `${e.message}${me ? `\n  Cuentas de esta sesión: ${listaDeCuentas(me)}.` : ''}`,
  );
}

/** La marca: --tenant, la del proyecto linkeado, o elegir de las que puede. */
async function elegirMarca(
  ctx: Ctx,
  me: Me,
  flag: string | undefined,
  previa: string | undefined,
): Promise<string> {
  const pedida = flag ?? previa;
  if (pedida) {
    const t = me.tenants.find((x) => x.tenant === pedida);
    if (t && !t.can_link)
      throw new CliError(
        `Tu rol en ${pedida} (${t.role ?? 'sin rol'}) no alcanza para crear tokens: hace falta ser admin de la marca.`,
      );
    const todas = me.token.all_tenants !== false;
    if (!t && !todas && !me.token.tenants?.includes(pedida))
      throw new CliError(
        `Esta sesión de la CLI no tiene acceso a "${pedida}". Corré \`hermes login\` y autorizá esa cuenta.\n  Cuentas de esta sesión: ${listaDeCuentas(me)}.`,
      );
    if (!t && !me.is_staff)
      throw new CliError(
        `No tenés acceso a la marca "${pedida}". Corré \`hermes whoami\` para ver las tuyas.`,
      );
    return pedida;
  }
  const posibles = me.tenants.filter((t) => t.can_link);
  if (!posibles.length)
    throw new CliError(
      me.tenants.length
        ? 'No sos admin de ninguna de tus marcas: pedile a un admin de la marca que te dé el rol, o que corra el link.'
        : me.token.all_tenants === false
          ? 'Esta sesión de la CLI no tiene ninguna marca disponible: corré `hermes login` y autorizá las cuentas que necesites.'
          : 'Tu usuario no tiene acceso a ninguna marca.',
    );
  const t = await elegir(ctx, '¿Qué marca querés linkear?', posibles, (x) =>
    x.name && x.name !== x.tenant ? `${x.name} (${x.tenant})` : x.tenant,
  );
  return t.tenant;
}

/**
 * Pide el link a la API y escribe .env, .gitignore y .hermes/project.json.
 *
 * El link crea TUS tokens de desarrollo (personales, atados a tu usuario):
 * nunca toca los de la tienda publicada (los maneja Hermes) ni los de otro
 * developer, así que no hay nada que confirmar. Si ya tenías tokens de
 * desarrollo de este proyecto, se rotan (una copia por persona y proyecto).
 */
async function linkear(
  ctx: Ctx,
  cliente: HermesApi,
  api: string,
  flags: Parsed['flags'],
  tenant: string,
  proyecto: string,
): Promise<LinkResult> {
  const domains = Array.isArray(flags.domain) ? flags.domain : [];
  const revalidate = str(flags['revalidate-url']);
  const r = await cliente.link(tenant, {
    project_name: proyecto,
    ...(domains.length ? { domains } : {}),
    ...(flags.private === false ? { private: false } : {}),
    ...(revalidate ? { revalidate_url: revalidate } : {}),
  });

  // Todas las HERMES_*: las que vinieron se escriben, las que no, se borran
  // (un secreto de revalidación viejo ya no sirve tras rotar el privado).
  const cambios: Record<string, string | undefined> = {};
  for (const k of VARIABLES_HERMES) cambios[k] = r.env[k];
  const archivo = archivoEnv(flags);
  const path = await escribirEnv(ctx.cwd, cambios, archivo);
  const agregado = archivo === '.env' ? await asegurarGitignore(ctx.cwd) : false;
  // project.json se comparte por git: sin nada personal, y sin reescribirlo
  // si no cambió (cada link no ensucia el repo).
  const previo = await leerProyecto(ctx.cwd);
  if (
    !previo ||
    previo.tenant !== tenant ||
    previo.project_name !== r.project_name ||
    previo.api !== api ||
    previo.public_token_id !== undefined
  )
    await guardarProyecto(ctx.cwd, {
      tenant,
      project_name: r.project_name,
      api,
      linked_at: new Date().toISOString(),
    });

  ctx.out('');
  ctx.out(
    `✔ ${r.rotated ? 'Tokens de desarrollo rotados' : 'Proyecto linkeado'}: "${r.project_name}" → ${tenant}`,
  );
  ctx.out(`  Público  ${r.public_token.token_prefix}…  (${r.public_token.name})`);
  if (r.private_token)
    ctx.out(
      `  Privado  ${r.private_token.token_prefix}…  (${r.private_token.scopes.join(', ')}) — sólo server-side, nunca al navegador`,
    );
  if (r.domains.length) ctx.out(`  Dominios ${r.domains.join(', ')}`);
  if (r.revalidate) ctx.out(`  Webhook storefront/revalidate → ${r.revalidate.url}`);
  ctx.out(`  Variables escritas en ${path}`);
  ctx.out(
    `  Son tus tokens de desarrollo (personales${r.localhost ? ', con localhost' : ''}): la tienda publicada en Hermes usa los del proyecto, que maneja Hermes.`,
  );
  if (r.rotated) ctx.out('  Tus tokens de desarrollo anteriores de este proyecto ya no valen.');
  if (agregado) ctx.out('  Agregué .env a tu .gitignore.');
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
  return r;
}

export async function link(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const { api, cliente } = await conSesion(ctx, flags);
  const previo = await leerProyecto(ctx.cwd);
  const mismoApi = previo?.api === api ? previo : null;
  const me = await cliente.me();
  const tenant = await elegirMarca(ctx, me, str(flags.tenant), mismoApi?.tenant);
  try {
    await linkearProyecto(ctx, cliente, api, flags, tenant, mismoApi);
  } catch (e) {
    throw errorDeCuenta(e, me);
  }
}

async function linkearProyecto(
  ctx: Ctx,
  cliente: HermesApi,
  api: string,
  flags: Parsed['flags'],
  tenant: string,
  mismoApi: Awaited<ReturnType<typeof leerProyecto>>,
): Promise<void> {
  const previo = mismoApi?.tenant === tenant ? mismoApi : null;
  const lista = await cliente.proyectos(tenant);
  const elegido = lista
    ? await elegirProyecto(ctx, tenant, lista, str(flags.name), previo?.project_name)
    : { nombre: await nombreAPreguntar(ctx, str(flags.name), previo?.project_name), unico: false };
  await linkear(ctx, cliente, api, flags, tenant, elegido.nombre);
  if (elegido.unico)
    ctx.out(
      `  Linkeado al proyecto «${elegido.nombre}» de ${tenant} (es el proyecto de la tienda; para trabajar en equipo, cada uno usa su branch con \`hermes deploy --preview\`).`,
    );
  ctx.out('');
  ctx.out('  En equipo: tu branch → `hermes deploy --preview` (cada uno con su URL de preview).');
  ctx.out(`             producción → \`main\` desde CI con \`hermes deploy-token\` (ver la guía: ${GUIA_EQUIPO}).`);
}

const GUIA_EQUIPO = 'https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/guia-agencias.md#trabajar-en-equipo';

/** Lo de antes (API sin la lista de proyectos): `--name`, o preguntar. */
async function nombreAPreguntar(
  ctx: Ctx,
  flag: string | undefined,
  previo: string | undefined,
): Promise<string> {
  if (flag) return flag;
  const sugerido = previo ?? (await nombrePorDefecto(ctx.cwd));
  const r = ctx.interactive ? await ctx.ask(`Nombre del proyecto [${sugerido}]: `) : '';
  return r.trim() || sugerido;
}

const etiquetaDeProyecto = (p: ProyectoDeMarca) => {
  const extra = [
    p.production_url ?? (p.has_hosting ? 'sin producción activa' : 'sin deploys en el hosting'),
    p.last_deploy_at ? `último deploy ${p.last_deploy_at.slice(0, 10)}` : null,
  ].filter(Boolean);
  return `${p.name} (${extra.join(', ')})`;
};

/**
 * El proyecto de la marca para este link. Una tienda tiene, por lo general,
 * UN proyecto: el equipo trabaja sobre él con branches y previews.
 *
 *  - Con deploys en el hosting, los proyectos son ésos (los que cuenta el
 *    plan); los que sólo tienen tokens de desarrollo (un link a un nombre que
 *    nunca se deployó) no se ofrecen. Sin hosting, los que tienen tokens.
 *  - 1 → ése, sin preguntar. Varios → elegir (+ «Crear un proyecto nuevo» si
 *    el plan tiene lugar). Ninguno → preguntar el nombre, como antes.
 *  - `--name` fuerza un proyecto; si es nuevo y el plan ya está lleno, falla
 *    acá y no recién en `hermes deploy`.
 *  - Si project.json apunta a un proyecto que no es de la marca, avisa y
 *    ofrece cambiarlo.
 */
async function elegirProyecto(
  ctx: Ctx,
  tenant: string,
  lista: ProyectosDeMarca,
  flag: string | undefined,
  previo: string | undefined,
): Promise<{ nombre: string; unico: boolean }> {
  const conHosting = lista.projects.filter((p) => p.has_hosting);
  const candidatos = conHosting.length ? conHosting : lista.projects;
  const lleno = lista.max_projects !== null && conHosting.length >= lista.max_projects;
  const existe = (nombre: string) => candidatos.find((p) => p.name === slugDeProyecto(nombre));
  const unico = (nombre: string) => candidatos.length === 1 && candidatos[0].name === slugDeProyecto(nombre);
  const errorDePlan = (pedido: string) =>
    new CliError(
      `El plan de ${tenant} permite ${lista.max_projects} ${lista.max_projects === 1 ? 'proyecto' : 'proyectos'} y ya ${
        conHosting.length === 1 ? `existe «${conHosting[0].name}»` : `existen ${conHosting.map((p) => `«${p.name}»`).join(', ')}`
      }: «${slugDeProyecto(pedido)}» no se podría deployar. Usá ${
        conHosting.length === 1 ? 'ese' : 'uno de esos'
      }: \`hermes link --name ${conHosting[0].name}\`.`,
    );

  if (flag) {
    if (lleno && !conHosting.some((p) => p.name === slugDeProyecto(flag))) throw errorDePlan(flag);
    return { nombre: flag, unico: unico(flag) };
  }

  if (previo) {
    if (existe(previo) || !candidatos.length) {
      if (!existe(previo) && lleno) throw errorDePlan(previo);
      return { nombre: previo, unico: unico(previo) };
    }
    // project.json apunta a un proyecto que la marca no tiene (p. ej. un
    // nombre que se linkeó y nunca se deployó).
    ctx.err(
      `⚠ Esta carpeta está linkeada al proyecto «${previo}», pero ${tenant} no lo tiene: ${
        candidatos.length === 1
          ? `el proyecto de la tienda es «${candidatos[0].name}»`
          : `sus proyectos son ${candidatos.map((p) => `«${p.name}»`).join(', ')}`
      }.${lleno ? ` El plan permite ${lista.max_projects} y ya están en uso: «${slugDeProyecto(previo)}» no se podría deployar.` : ''}`,
    );
    if (candidatos.length === 1) {
      if (await confirmar(ctx, `¿Cambiarlo a «${candidatos[0].name}»?`, true))
        return { nombre: candidatos[0].name, unico: true };
      if (lleno) throw errorDePlan(previo);
      return { nombre: previo, unico: false };
    }
    if (!ctx.interactive) {
      if (lleno) throw errorDePlan(previo);
      return { nombre: previo, unico: false };
    }
    const seguir = { name: previo, production_url: null, last_deploy_at: null, has_hosting: false };
    const opciones: Array<ProyectoDeMarca | null> = [...candidatos, ...(lleno ? [] : [seguir])];
    const r = await elegir(ctx, `¿Qué proyecto de ${tenant} querés usar?`, opciones, (p) =>
      p === seguir ? `Seguir con «${previo}» (proyecto nuevo)` : etiquetaDeProyecto(p!),
    );
    return { nombre: r!.name, unico: false };
  }

  if (candidatos.length === 1) return { nombre: candidatos[0].name, unico: true };
  if (!candidatos.length) {
    const nombre = await nombreAPreguntar(ctx, undefined, undefined);
    if (lleno) throw errorDePlan(nombre);
    return { nombre, unico: false };
  }
  if (!ctx.interactive)
    throw new CliError(
      `${tenant} tiene varios proyectos (${candidatos.map((p) => p.name).join(', ')}): elegí uno con \`hermes link --name <proyecto>\`.`,
    );
  const nuevo = null;
  const opciones: Array<ProyectoDeMarca | null> = [...candidatos, ...(lleno ? [] : [nuevo])];
  const r = await elegir(ctx, `¿Qué proyecto de ${tenant} querés usar?`, opciones, (p) =>
    p === nuevo ? 'Crear un proyecto nuevo' : etiquetaDeProyecto(p),
  );
  if (r) return { nombre: r.name, unico: false };
  return { nombre: await nombreAPreguntar(ctx, undefined, undefined), unico: false };
}

export async function unlink(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada (no hay .hermes/project.json).');
  if (flags.revoke) {
    const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
    if (!flags.yes && ctx.interactive)
      if (
        !(await confirmar(
          ctx,
          `¿Revocar tus tokens de desarrollo de "${p.project_name}" en ${p.tenant}? (La tienda publicada y los de otros no se tocan.)`,
        ))
      )
        throw new CliError('Cancelado: no se tocó nada.', 0);
    const r = await cliente.revocarDev(p.tenant, p.project_name);
    ctx.out(
      r.revoked_token_ids.length
        ? `  Revocados tus tokens de desarrollo: ${r.revoked_token_ids.map((id) => `#${id}`).join(', ')}.`
        : '  No tenías tokens de desarrollo vigentes de este proyecto.',
    );
  }
  const cambios: Record<string, undefined> = {};
  for (const k of VARIABLES_HERMES) cambios[k] = undefined;
  await escribirEnv(ctx.cwd, cambios, archivoEnv(flags));
  await borrarProyecto(ctx.cwd);
  ctx.out(
    `✔ Deslinkeado "${p.project_name}" (${p.tenant}): saqué las variables HERMES_* del ${archivoEnv(flags)}.`,
  );
  if (!flags.revoke)
    ctx.out('  Tus tokens de desarrollo siguen vigentes en la API: `hermes unlink --revoke` para revocarlos.');
}

/**
 * `hermes env pull`: deja el .env al día con el proyecto linkeado. Los
 * tokens en claro no se pueden volver a bajar (la API guarda sólo el hash):
 * sin --rotate verifica que los del .env sigan vigentes; con --rotate emite
 * tus tokens de desarrollo nuevos (y revoca tus anteriores). Nunca toca los
 * de la tienda publicada (`hermes tokens rotate --runtime`).
 */
export async function envPull(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const p = await leerProyecto(ctx.cwd);
  if (!p)
    throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { api, cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  if (flags.rotate) {
    await linkear(ctx, cliente, api, flags, p.tenant, p.project_name);
    return;
  }
  const archivo = archivoEnv(flags);
  const env = await leerEnv(ctx.cwd, archivo);
  const problemas = await problemasDeTokens(cliente, p, env, archivo);

  await escribirEnv(
    ctx.cwd,
    {
      HERMES_TENANT: p.tenant,
      HERMES_API_URL: leerVariable(env, 'HERMES_API_URL') || `${api}/api`,
    },
    archivo,
  );
  if (problemas.length) {
    for (const x of problemas) ctx.err(`  ✘ ${x}`);
    throw new CliError(
      'Los tokens en claro no se pueden volver a bajar. Para emitir tus tokens de desarrollo nuevos (y revocar los anteriores): `hermes env pull --rotate`.',
    );
  }
  ctx.out(`✔ ${archivo} al día: "${p.project_name}" → ${p.tenant}, tokens vigentes.`);
}

/**
 * ¿Los tokens del .env son tokens vigentes de la marca? Se reconocen por su
 * prefijo en el listado (sin los ids de project.json: ese archivo es del
 * equipo y cada uno tiene sus tokens). Devuelve la lista de problemas (vacía
 * = todo bien). La usan `env pull`, `dev` y `preview`.
 */
export async function problemasDeTokens(
  cliente: HermesApi,
  p: Proyecto,
  env: string,
  archivo: string,
): Promise<string[]> {
  const tokens = (await cliente.tokens(p.tenant)).storefront_tokens;
  const problemas: string[] = [];
  const revisar = (variable: string, kind: 'public' | 'private', tipo: string, obligatorio: boolean) => {
    const valor = leerVariable(env, variable);
    if (!valor) {
      if (obligatorio) problemas.push(`falta ${variable} en ${archivo}`);
      return;
    }
    const t = tokens.find((x) => (x.kind ?? 'public') === kind && valor.startsWith(x.token_prefix));
    if (!t) problemas.push(`${variable} no es un token ${tipo} de ${p.tenant}`);
    else if (t.revoked_at) problemas.push(`${variable}: el token ${tipo} (${t.token_prefix}…) está revocado`);
  };
  revisar('HERMES_PUBLIC_TOKEN', 'public', 'público', true);
  revisar('HERMES_PRIVATE_TOKEN', 'private', 'privado', false);
  return problemas;
}

import { ApiError, EventoDeLog, HermesApi, esRutaInexistente } from '../api';
import { Parsed, str } from '../args';
import { branchDeGit } from '../bundle';
import { Ctx } from '../context';
import { CliError } from '../errors';
import { Proyecto, leerProyecto } from '../project';
import { conSesion } from './common';

/** Cada cuánto se piden los logs nuevos en modo tail. */
export const SONDEO_MS = 3000;
/** Un tail dura como mucho esto (la API también lo acota con su rate limit). */
export const MAX_TAIL_MS = 15 * 60 * 1000;
/**
 * Cada sondeo vuelve a pedir este margen hacia atrás: Workers Logs puede
 * tardar unos segundos en tener un evento, y los repetidos se descartan.
 */
const SOLAPE_MS = 30 * 1000;

const SINCE = /^(\d{1,5})(s|m|h|d)$/;

export const SIN_LOGS_EN_LA_API =
  'La API todavía no tiene `hermes logs`. Avisale a Pow o probá más tarde.';

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('es-AR', { hour12: false });
};

const esError = (e: EventoDeLog) =>
  (e.status !== null && e.status >= 500) || (e.outcome !== null && e.outcome !== 'ok') || e.level === 'error' || e.error !== null;

/** Una línea legible por evento: el pedido y, debajo, sus console.*. */
export function lineaDe(e: EventoDeLog): string {
  const t = hora(e.timestamp);
  if (e.type === 'request') {
    const marca = esError(e) ? '✘' : ' ';
    const status = e.status ?? (e.outcome && e.outcome !== 'ok' ? e.outcome : '—');
    const dur = e.duration_ms !== null ? `  ${Math.round(e.duration_ms)} ms` : '';
    const extra = e.outcome && e.outcome !== 'ok' && e.status !== null ? `  (${e.outcome})` : '';
    return `${marca} ${t}  ${(e.method ?? '—').padEnd(6)} ${String(status).padEnd(4)} ${e.path ?? ''}${dur}${extra}`;
  }
  const nivel = (e.level ?? 'log').padEnd(5);
  const texto = [e.message, e.error].filter(Boolean).join(' — ');
  return `${e.level === 'error' || e.error ? '✘' : ' '} ${t}    │ ${nivel} ${texto}`;
}

/** Los eventos agrupados por pedido (el pedido primero), en orden de llegada. */
export function agrupar(eventos: EventoDeLog[]): EventoDeLog[] {
  const grupos = new Map<string, EventoDeLog[]>();
  for (const e of eventos) {
    const k = e.request_id ?? `#${e.timestamp}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(e);
  }
  const out: EventoDeLog[] = [];
  for (const g of grupos.values())
    out.push(...g.filter((e) => e.type === 'request'), ...g.filter((e) => e.type !== 'request'));
  return out;
}

const clave = (e: EventoDeLog) => `${e.timestamp}|${e.request_id ?? ''}|${e.type}|${e.message ?? ''}|${e.error ?? ''}`;

async function contexto(ctx: Ctx, flags: Parsed['flags']): Promise<{ p: Proyecto; cliente: HermesApi }> {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  return { p, cliente };
}

function traducir(e: unknown): unknown {
  if (esRutaInexistente(e)) return new CliError(SIN_LOGS_EN_LA_API);
  if (e instanceof ApiError && e.status === 429)
    return new CliError(
      'Llegaste al tope de pedidos de logs de esta sesión (un tail dura ~15 minutos). Esperá unos minutos y volvé a correr `hermes logs`.',
    );
  return e;
}

/**
 * `hermes logs [--preview [--branch x]] [--status error|ok] [--search texto]
 * [--since 1h] [--json] [--no-follow]`: los logs de la tienda publicada
 * (pedidos, console.log, errores y excepciones). Por defecto queda «en vivo»
 * (pide los nuevos cada 3 s, hasta 15 minutos o Ctrl+C); con --since
 * muestra también los recientes (hasta 7 días). La CLI nunca habla con
 * Cloudflare: la API consulta y filtra.
 */
export async function logs(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const preview = flags.preview === true;
  const status = str(flags.status);
  if (status !== undefined && status !== 'error' && status !== 'ok') throw new CliError('--status: error u ok.');
  const since = str(flags.since);
  if (since !== undefined && !SINCE.test(since) && Number.isNaN(Date.parse(since)))
    throw new CliError('--since: 30s, 15m, 1h, 2d o una fecha (ISO).');
  const search = str(flags.search);
  const follow = flags.follow !== false;
  const json = flags.json === true;
  const { p, cliente } = await contexto(ctx, flags);
  let branch: string | undefined;
  if (preview) {
    branch = str(flags.branch) ?? (await branchDeGit(ctx.cwd)) ?? undefined;
    if (!branch) throw new CliError('Para los logs de una preview pasá --branch <nombre> (no encontré la branch de git).');
  }
  const base = {
    project: p.project_name,
    environment: (preview ? 'preview' : 'production') as 'production' | 'preview',
    ...(branch ? { branch } : {}),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  };
  const vistos = new Set<string>();
  const mostrar = (eventos: EventoDeLog[]) => {
    for (const e of agrupar(eventos)) {
      const k = clave(e);
      if (vistos.has(k)) continue;
      vistos.add(k);
      ctx.out(json ? JSON.stringify(e) : lineaDe(e));
    }
    // Que el set no crezca sin fin en un tail largo.
    if (vistos.size > 20000) for (const k of [...vistos].slice(0, 10000)) vistos.delete(k);
  };
  const entorno = preview ? `preview de ${branch}` : 'producción';
  if (!json)
    ctx.err(
      `Logs de "${p.project_name}" (${p.tenant}, ${entorno})${status ? ` · status ${status}` : ''}${search ? ` · «${search}»` : ''}${follow ? ' — en vivo, Ctrl+C para salir' : ''}`,
    );

  // Primera tanda: los recientes (--since) o los del último minuto.
  let desde = since ?? '1m';
  let r;
  try {
    r = await cliente.logs(p.tenant, { ...base, since: desde, limit: 200 });
  } catch (e) {
    throw traducir(e);
  }
  mostrar(r.events);
  if (r.truncated && !json)
    ctx.err('  ⚠ Hay más eventos de los que entran en un pedido: acotá con --since, --status o --search.');
  if (!r.events.length && !json && !follow)
    ctx.err(
      '  Sin logs en ese rango. Si la tienda se deployó antes de que Hermes prendiera los logs, se prenden en el próximo `hermes deploy`.',
    );
  if (!follow) return;

  const inicio = Date.now();
  let dormido = 0;
  let ultimo = Date.parse(r.to) || Date.now();
  while (dormido < MAX_TAIL_MS && Date.now() - inicio < MAX_TAIL_MS) {
    await ctx.sleep(SONDEO_MS);
    dormido += SONDEO_MS;
    desde = new Date(ultimo - SOLAPE_MS).toISOString();
    try {
      r = await cliente.logs(p.tenant, { ...base, since: desde, limit: 200 });
    } catch (e) {
      throw traducir(e);
    }
    mostrar(r.events);
    ultimo = Date.parse(r.to) || ultimo + SONDEO_MS;
  }
  if (!json) ctx.err('Pasaron 15 minutos: corté el tail. Volvé a correr `hermes logs` para seguir.');
}

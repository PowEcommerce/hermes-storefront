import { Dominio } from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import { CliError } from '../errors';
import { leerProyecto } from '../project';
import { confirmar, conSesion } from './common';

async function contexto(ctx: Ctx, flags: Parsed['flags']) {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  return { p, cliente };
}

const ESTADO: Record<Dominio['status'], string> = {
  active: '● activo',
  pending: '○ pendiente',
  error: '✘ error',
};

/**
 * El dominio, su estado en palabras y lo que el cliente tiene que cargar en
 * su DNS: el CNAME (obligatorio; los pendientes, o todos con `todos`), la
 * pre-validación opcional y el apex opcional.
 */
function mostrarDominio(ctx: Ctx, d: Dominio, todos = false) {
  ctx.out(
    `${ESTADO[d.status]}  ${d.hostname}  (${d.role === 'checkout' ? 'checkout hosteado' : `tienda${d.project ? ` · ${d.project}` : ''}`})${d.status === 'active' && !d.routed && d.source === 'cli' ? '  — sin ruta todavía' : ''}`,
  );
  if (d.status === 'pending' && d.status_message) ctx.out(`    ${d.status_message}`);
  const regs = d.dns_records.filter((r) => todos || r.status !== 'verified');
  if (d.status !== 'active' && regs.length) {
    ctx.out('    Cargá en el DNS de tu dominio:');
    for (const r of regs) ctx.out(`      ${r.type.padEnd(5)} ${r.name}  →  ${r.value}`);
  }
  mostrarPrevalidacion(ctx, d);
  if (d.status === 'error')
    ctx.out(`    Cloudflare: ${d.cf_status ?? '?'} / SSL ${d.ssl_status ?? '?'}. Revisá los registros o escribile a Pow.`);
  mostrarApex(ctx, d);
}

/**
 * El TXT de pre-validación (opcional): sólo mientras el dominio no está
 * activo y ese TXT no se verificó.
 */
function mostrarPrevalidacion(ctx: Ctx, d: Dominio) {
  const regs = (d.optional_records ?? []).filter((r) => r.status !== 'verified');
  if (d.status === 'active' || !regs.length) return;
  ctx.out(
    `    Opcional — ${regs[0].description ?? 'solo si tu dominio hoy apunta a otro sitio: cargá este TXT antes de cambiar el CNAME.'}`,
  );
  for (const r of regs) ctx.out(`      ${r.type.padEnd(5)} ${r.name}  →  ${r.value}`);
}

/** El A/AAAA opcional del apex (redirect `<x>` → `www.<x>`), si la API lo manda. */
function mostrarApex(ctx: Ctx, d: Dominio) {
  const regs = d.apex_records ?? [];
  if (!regs.length) return;
  const apex = regs[0].name;
  ctx.out(`    Opcional, para que ${apex} sin www redirija a ${d.hostname}:`);
  for (const r of regs) ctx.out(`      ${r.type.padEnd(5)} ${r.name}  →  ${r.value}`);
}

/** Pollea `GET domains` hasta que los hosts queden activos (o se acabe el tiempo). */
async function esperar(
  ctx: Ctx,
  cliente: Awaited<ReturnType<typeof contexto>>['cliente'],
  tenant: string,
  hosts: string[],
  flags: Parsed['flags'],
): Promise<void> {
  const limite = Number(str(flags.timeout) ?? '900');
  if (!Number.isFinite(limite) || limite <= 0) throw new CliError('--timeout: segundos (ej. 900)');
  const intervalo = 15;
  ctx.out(`Esperando que Cloudflare valide ${hosts.join(' y ')} (cada ${intervalo} s, hasta ${Math.round(limite / 60)} min; Ctrl+C para cortar)…`);
  const ultimo = new Map<string, string>();
  for (let t = 0; t <= limite; t += intervalo) {
    const r = await cliente.dominios(tenant);
    const mios = r.domains.filter((d) => hosts.includes(d.hostname));
    // Cada cambio de estado en palabras (p. ej. «Emitiendo el certificado…»), una vez.
    for (const d of mios)
      if (d.status === 'pending' && d.status_message && ultimo.get(d.hostname) !== d.status_message) {
        ultimo.set(d.hostname, d.status_message);
        ctx.out(`  ${d.hostname}: ${d.status_message}`);
      }
    const error = mios.find((d) => d.status === 'error');
    if (error) {
      mostrarDominio(ctx, error);
      throw new CliError(`${error.hostname} quedó con error en Cloudflare.`);
    }
    if (mios.length && mios.every((d) => d.status === 'active' && (d.routed || d.source !== 'cli'))) {
      for (const d of mios) mostrarDominio(ctx, d);
      ctx.out(`✔ ${hosts.map((h) => `https://${h}`).join(' y ')} en el aire.`);
      return;
    }
    await ctx.sleep(intervalo * 1000);
  }
  throw new CliError(
    'Todavía no se validó (el DNS puede tardar hasta unas horas). Seguí el estado con `hermes domains list`.',
  );
}

/**
 * `hermes domains add <hostname> [--checkout-subdomain] [--wait]`.
 *
 * Por defecto conecta SÓLO la tienda (`www.<dominio>`): hosteada en Pow, el
 * checkout se sirve en el mismo dominio (`www.<dominio>/checkout/...`).
 * `--checkout-subdomain` suma `checkout.<dominio>` (para un front hosteado
 * afuera que quiere el checkout bajo su dominio). `--no-checkout` (de
 * versiones viejas) se acepta y es lo mismo que el default.
 */
export async function domainsAdd(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const host = positional[2];
  if (!host) throw new CliError('Uso: hermes domains add <dominio> (ej. www.mitienda.com)');
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.agregarDominio(p.tenant, {
    hostname: host,
    project: p.project_name,
    ...(flags['checkout-subdomain'] === true ? { checkout: true } : {}),
  });
  ctx.out(`✔ Dominio agregado a "${p.project_name}" (${p.tenant}).`);
  for (const d of r.domains) mostrarDominio(ctx, d, true);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
  const hosts = r.domains.map((d) => d.hostname);
  if (flags.wait) await esperar(ctx, cliente, p.tenant, hosts, flags);
  else if (r.domains.some((d) => d.status !== 'active'))
    ctx.out('\nCuando cargues el CNAME: `hermes domains list` (o `hermes domains add … --wait` para esperar). El certificado se emite solo.');
}

/** `hermes domains list [--json]`: estado de los dominios de la marca (refresca contra Cloudflare). */
export async function domainsList(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.dominios(p.tenant);
  if (flags.json) {
    ctx.out(JSON.stringify(r.domains, null, 2));
    return;
  }
  if (!r.domains.length) ctx.out('Todavía no hay dominios: `hermes domains add www.tu-dominio.com`.');
  for (const d of r.domains) mostrarDominio(ctx, d);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/** `hermes domains remove <hostname> [--yes]`. */
export async function domainsRemove(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const host = positional[2];
  if (!host) throw new CliError('Uso: hermes domains remove <dominio>');
  const { p, cliente } = await contexto(ctx, flags);
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para sacar un dominio sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Sacar ${host} de Hermes? La tienda deja de responder en ese dominio.`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  const r = await cliente.quitarDominio(p.tenant, host);
  ctx.out(`✔ Sacados: ${r.removed.join(', ')}. Ya podés borrar sus registros de tu DNS.`);
}

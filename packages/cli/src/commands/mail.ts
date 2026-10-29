import { DominioDeMail, RemitenteDeMail } from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import { CliError } from '../errors';
import { leerProyecto } from '../project';
import { confirmar, conSesion } from './common';

/**
 * Mails de la marca, como en el admin (Configuración General → Mails):
 *
 *  - Por defecto no hay que hacer nada: los mails salen de la dirección de
 *    Pow con el nombre de la marca y las respuestas van al email de la marca.
 *  - `hermes mail-domains add <dominio>` autentica tu dominio (DKIM + MAIL
 *    FROM) y te muestra los registros DNS; cuando verifica,
 *    `hermes mail-sender set ventas@<dominio>` hace que salgan desde ahí.
 */
async function contexto(ctx: Ctx, flags: Parsed['flags']) {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  return { p, cliente };
}

const ESTADO: Record<DominioDeMail['status'], string> = {
  verified: '● verificado',
  pending: '○ pendiente',
  failed: '✘ error',
};

function mostrarRemitente(ctx: Ctx, s: RemitenteDeMail, disponible = true) {
  ctx.out(`Tus mails salen como: ${s.effective.from}`);
  ctx.out(`Las respuestas van a: ${s.effective.reply_to ?? '(sin reply-to: configuralo con --reply-to)'}`);
  if (s.effective.via === 'plataforma' && disponible)
    ctx.out(`  (dirección de Pow con el nombre de tu marca; para usar tu dominio: \`hermes mail-domains add <dominio>\`)`);
  if (s.managed_by_pow) ctx.out('  (SMTP propio configurado por Pow: el remitente lo cambia Pow)');
  if (s.fallback_reason) ctx.err(`  ⚠ ${s.fallback_reason}`);
}

function mostrarDominio(ctx: Ctx, d: DominioDeMail, todos = false) {
  ctx.out(`${ESTADO[d.status]}  ${d.domain}`);
  const regs = d.dns_records.filter((r) => todos || r.status !== 'verified');
  if (d.status !== 'verified' && regs.length) {
    ctx.out('    Cargá en el DNS de tu dominio:');
    for (const r of regs)
      ctx.out(`      ${r.type.padEnd(5)} ${r.name}  →  ${r.priority != null ? `${r.priority} ` : ''}${r.value}`);
  }
  for (const r of d.suggested_records.filter((x) => x.status !== 'present'))
    ctx.out(`    Recomendado (DMARC): ${r.type} ${r.name}  →  ${r.value}`);
  if (d.last_error) ctx.err(`    ⚠ ${d.last_error}`);
}

/** `hermes mail-domains add <dominio>`. */
export async function mailDomainsAdd(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const domain = positional[2];
  if (!domain) throw new CliError('Uso: hermes mail-domains add <dominio> (ej. mitienda.com)');
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.agregarDominioDeMail(p.tenant, domain);
  ctx.out(`✔ ${r.mail_domain.domain} agregado a los mails de ${p.tenant}.`);
  mostrarDominio(ctx, r.mail_domain, true);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
  if (r.mail_domain.status !== 'verified')
    ctx.out(
      `\nEl DNS puede tardar hasta 72 h. Seguí el estado con \`hermes mail-domains list\` (o \`hermes mail-domains verify ${r.mail_domain.domain}\`).\nCuando verifique: \`hermes mail-sender set ventas@${r.mail_domain.domain}\`.`,
    );
}

/** `hermes mail-domains list [--json]`: remitente actual + dominios. */
export async function mailDomainsList(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.dominiosDeMail(p.tenant);
  if (flags.json) {
    ctx.out(JSON.stringify({ sender: r.sender, mail_domains: r.mail_domains }, null, 2));
    return;
  }
  mostrarRemitente(ctx, r.sender, r.available !== false);
  ctx.out('');
  if (r.available === false) ctx.out('Autenticar tu dominio de mail todavía no está disponible para tu marca.');
  else if (!r.ses_enabled) ctx.out('La autenticación de dominios de mail todavía no está habilitada en Pow.');
  else if (!r.mail_domains.length) ctx.out('Sin dominios de mail: `hermes mail-domains add tu-dominio.com`.');
  for (const d of r.mail_domains) mostrarDominio(ctx, d);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/** `hermes mail-domains verify <dominio>`: re-consulta SES ya. */
export async function mailDomainsVerify(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const domain = positional[2];
  if (!domain) throw new CliError('Uso: hermes mail-domains verify <dominio>');
  const { p, cliente } = await contexto(ctx, flags);
  const r = await cliente.verificarDominioDeMail(p.tenant, domain);
  mostrarDominio(ctx, r.mail_domain);
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/** `hermes mail-domains remove <dominio> [--yes]`. */
export async function mailDomainsRemove(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const domain = positional[2];
  if (!domain) throw new CliError('Uso: hermes mail-domains remove <dominio>');
  const { p, cliente } = await contexto(ctx, flags);
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para sacar un dominio de mail sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Sacar ${domain} de los mails? Si tus mails salían desde ahí, vuelven a salir desde Pow.`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  const r = await cliente.quitarDominioDeMail(p.tenant, domain);
  ctx.out(`✔ ${r.removed} sacado. Ya podés borrar sus registros de tu DNS.`);
  if (r.sender_reset) ctx.out('  Tus mails vuelven a salir desde la dirección de Pow.');
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/**
 * `hermes mail-sender` (muestra) y
 * `hermes mail-sender set <email|pow> [--reply-to <email>] [--name <nombre>]`.
 * `pow` vuelve a la dirección de Pow. El email tiene que ser de un dominio
 * tuyo ya verificado.
 */
export async function mailSender(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const { p, cliente } = await contexto(ctx, flags);
  if (positional[1] !== 'set') {
    if (positional[1]) throw new CliError('Uso: hermes mail-sender [set <email|pow>]');
    const r = await cliente.dominiosDeMail(p.tenant);
    mostrarRemitente(ctx, r.sender, r.available !== false);
    return;
  }
  const desde = positional[2];
  const replyTo = str(flags['reply-to']);
  const nombre = str(flags.name);
  if (!desde && replyTo === undefined && nombre === undefined)
    throw new CliError('Uso: hermes mail-sender set <email|pow> [--reply-to <email>] [--name <nombre>]');
  const body: { from_address?: string | null; reply_to?: string | null; from_name?: string | null } = {};
  if (desde) body.from_address = ['pow', 'default'].includes(desde.toLowerCase()) ? null : desde;
  if (replyTo !== undefined) body.reply_to = replyTo || null;
  if (nombre !== undefined) body.from_name = nombre || null;
  const r = await cliente.elegirRemitente(p.tenant, body);
  ctx.out(`✔ ${r.message}.`);
  mostrarRemitente(ctx, r.sender);
}

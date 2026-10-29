import { TokenListado } from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import { CliError } from '../errors';
import { Proyecto, leerProyecto } from '../project';
import { confirmar, conSesion } from './common';

async function proyectoLinkeado(ctx: Ctx): Promise<Proyecto> {
  const p = await leerProyecto(ctx.cwd);
  if (!p) throw new CliError('Esta carpeta no está linkeada: corré `hermes link` primero.');
  return p;
}

function entornoDe(flags: Parsed['flags'], porDefecto: 'production' | 'preview' | null) {
  const e = str(flags.environment) ?? porDefecto;
  if (e !== null && e !== 'production' && e !== 'preview')
    throw new CliError('--environment: production o preview.');
  return e;
}

const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR') : '—');

const PARA: Record<string, string> = {
  runtime: 'tienda publicada (Hermes)',
  dev: 'desarrollo',
};

function fila(t: TokenListado): string {
  const estado = t.revoked_at ? '–' : '●';
  const tipo = (t.kind ?? 'public') === 'private' ? 'privado' : 'público';
  const para = t.purpose ? PARA[t.purpose] : 'Pow / link anterior';
  const mio = t.own ? ' (tuyo)' : '';
  return `${estado} #${t.id}  ${t.token_prefix}…  ${tipo.padEnd(8)} ${para.padEnd(26)} ${t.name}${mio}${t.revoked_at ? '  revocado' : ''}`;
}

/** `hermes tokens [list] [--json]`: los tokens de la marca del proyecto (sin claros). */
export async function tokensList(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const p = await proyectoLinkeado(ctx);
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  const { storefront_tokens } = await cliente.tokens(p.tenant);
  if (flags.json) {
    ctx.out(JSON.stringify(storefront_tokens, null, 2));
    return;
  }
  const vigentes = flags.all === true ? storefront_tokens : storefront_tokens.filter((t) => !t.revoked_at);
  if (!vigentes.length) {
    ctx.out(`No hay tokens vigentes en ${p.tenant}.`);
    return;
  }
  for (const t of vigentes) ctx.out(fila(t));
}

/** `hermes tokens revoke <id> [--yes]`: revoca un token TUYO (de la CLI). */
export async function tokensRevoke(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const id = Number(positional[2]);
  if (!Number.isInteger(id) || id < 1) throw new CliError('Uso: hermes tokens revoke <id> (los ids salen de `hermes tokens`).');
  const p = await proyectoLinkeado(ctx);
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para revocar sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Revocar el token #${id}? Lo que lo use deja de andar.`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  await cliente.revocar(p.tenant, id);
  ctx.out(`✔ Token #${id} revocado.`);
}

/**
 * `hermes tokens rotate --runtime [--environment production|preview]`: rota
 * los tokens de la tienda publicada (admin de la marca o staff). Hermes
 * emite los nuevos, re-deploya con ellos y recién después revoca los
 * anteriores: la tienda no se cae.
 */
export async function tokensRotate(ctx: Ctx, { flags }: Parsed): Promise<void> {
  if (flags.runtime !== true)
    throw new CliError(
      'Tus tokens de desarrollo se rotan con `hermes env pull --rotate`. Los de la tienda publicada: `hermes tokens rotate --runtime` (admin de la marca).',
    );
  const p = await proyectoLinkeado(ctx);
  const environment = entornoDe(flags, 'production')!;
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para rotar sin terminal interactiva, pasá --yes.');
    const que = environment === 'production' ? 'producción' : 'las previews';
    if (
      !(await confirmar(
        ctx,
        `¿Rotar los tokens de ${que} de "${p.project_name}" (${p.tenant})? Hermes re-deploya la versión activa con los nuevos y después revoca los anteriores.`,
      ))
    )
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  const r = await cliente.rotarRuntime(p.tenant, { project: p.project_name, environment });
  ctx.out(`✔ Tokens de la tienda rotados (${r.environment}): público nuevo ${r.public_token_prefix}…`);
  ctx.out(
    r.redeployed.length
      ? `  Re-deploy con los nuevos: ${r.redeployed.map((id) => `#${id}`).join(', ')}`
      : '  No había deploys activos: el próximo `hermes deploy` los usa.',
  );
  ctx.out(
    r.previous_tokens_revoked
      ? '  Los anteriores quedaron revocados.'
      : '  Los anteriores siguen vigentes hasta que ningún deploy activo los use (el próximo `hermes deploy` termina la rotación).',
  );
  for (const w of r.warnings) ctx.err(`  ⚠ ${w}`);
}

/**
 * `hermes deploy-token create [--environment production|preview]`: un token
 * para deployar el proyecto desde CI (HERMES_DEPLOY_TOKEN). Se muestra UNA vez.
 */
export async function deployTokenCreate(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const p = await proyectoLinkeado(ctx);
  const environment = entornoDe(flags, null);
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  const { deploy_token: t } = await cliente.crearDeployToken(p.tenant, { project: p.project_name, environment });
  if (flags.json) {
    ctx.out(JSON.stringify(t, null, 2));
    return;
  }
  ctx.out(`✔ Token de deploy #${t.id} para "${t.project}" (${p.tenant}, ${t.environment ?? 'producción y previews'}):`);
  ctx.out('');
  ctx.out(`  ${t.token}`);
  ctx.out('');
  ctx.out('  Se muestra UNA sola vez. Cargalo como secreto HERMES_DEPLOY_TOKEN en tu CI');
  ctx.out('  (GitHub: Settings → Secrets and variables → Actions). Con él, `hermes deploy` no necesita login.');
  ctx.out(`  Revocalo con \`hermes deploy-token revoke ${t.id}\`.`);
}

/** `hermes deploy-token list [--json]`. */
export async function deployTokenList(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const p = await proyectoLinkeado(ctx);
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  const { deploy_tokens } = await cliente.deployTokens(p.tenant);
  if (flags.json) {
    ctx.out(JSON.stringify(deploy_tokens, null, 2));
    return;
  }
  if (!deploy_tokens.length) {
    ctx.out(`No hay tokens de deploy en ${p.tenant}: \`hermes deploy-token create\`.`);
    return;
  }
  for (const t of deploy_tokens)
    ctx.out(
      `${t.revoked_at ? '–' : '●'} #${t.id}  ${t.token_prefix}…  ${t.project.padEnd(20)} ${(t.environment ?? 'prod+preview').padEnd(12)} creado por ${t.created_by} ${fecha(t.created_at)} · último uso ${fecha(t.last_used_at)}${t.revoked_at ? '  revocado' : ''}`,
    );
}

/** `hermes deploy-token revoke <id> [--yes]`. */
export async function deployTokenRevoke(ctx: Ctx, { flags, positional }: Parsed): Promise<void> {
  const id = Number(positional[2]);
  if (!Number.isInteger(id) || id < 1)
    throw new CliError('Uso: hermes deploy-token revoke <id> (los ids salen de `hermes deploy-token list`).');
  const p = await proyectoLinkeado(ctx);
  const { cliente } = await conSesion(ctx, { ...flags, api: flags.api ?? p.api });
  if (flags.yes !== true) {
    if (!ctx.interactive) throw new CliError('Para revocar sin terminal interactiva, pasá --yes.');
    if (!(await confirmar(ctx, `¿Revocar el token de deploy #${id}? El CI que lo use deja de poder deployar.`)))
      throw new CliError('Cancelado: no se tocó nada.', 0);
  }
  await cliente.revocarDeployToken(p.tenant, id);
  ctx.out(`✔ Token de deploy #${id} revocado.`);
}

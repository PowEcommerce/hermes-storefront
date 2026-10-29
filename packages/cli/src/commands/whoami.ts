import { Parsed } from '../args';
import { Ctx } from '../context';
import { conSesion } from './common';

export async function whoami(ctx: Ctx, parsed: Parsed): Promise<void> {
  const { api, cliente } = await conSesion(ctx, parsed.flags);
  const me = await cliente.me();
  if (parsed.flags.json) {
    ctx.out(JSON.stringify({ api, ...me }, null, 2));
    return;
  }
  ctx.out(`${me.user.name} <${me.user.email}> en ${api}${me.is_staff ? ' (staff de POW)' : ''}`);
  ctx.out(`Sesión de la CLI ${me.token.prefix}… vence ${me.token.expires_at.slice(0, 10)}`);
  const todas = me.token.all_tenants !== false;
  if (!me.tenants.length) {
    ctx.out(
      todas
        ? 'No tenés acceso a ninguna marca.'
        : 'Esta sesión no tiene ninguna marca disponible (las que autorizaste ya no son accesibles). Corré `hermes login` y autorizá las cuentas que necesites.',
    );
    return;
  }
  ctx.out(
    todas
      ? me.is_staff
        ? 'Marcas (sesión autorizada en todas las marcas):'
        : 'Marcas:'
      : 'Marcas autorizadas en esta sesión:',
  );
  for (const t of me.tenants)
    ctx.out(
      `  ${t.tenant.padEnd(20)} ${t.name.padEnd(24)} ${(t.role ?? '-').padEnd(12)} ${t.can_link ? 'puede linkear' : 'sólo lectura'}`,
    );
  if (!todas)
    ctx.out(
      '  ¿Te falta una? Corré `hermes login` de nuevo y marcala al autorizar.',
    );
}

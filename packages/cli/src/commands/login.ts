import { ApiError, HermesApi } from '../api';
import { Parsed, str } from '../args';
import { ADMIN_HOSTS, verificacionConfiable } from '../browser';
import { Ctx } from '../context';
import { CliError } from '../errors';
import { store } from './common';

/** Tope de seguridad del sondeo aunque la API no diga expires_in. */
const MAX_ESPERA_MS = 15 * 60 * 1000;

/**
 * `hermes login`: OAuth 2.0 Device Authorization Grant (RFC 8628). Muestra
 * un código, abre el admin para aprobarlo y sondea respetando `interval` y
 * `slow_down`. Guarda el token de la CLI (`hct_`) en credentials.json (600).
 */
export async function login(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const s = store(ctx);
  const api = await s.api(str(flags.api), ctx.env);
  const cliente = new HermesApi(ctx, api);
  const code = await cliente.pedirCodigo(ctx.clientName);

  ctx.out('');
  ctx.out(`  Tu código: ${code.user_code}`);
  ctx.out('');
  ctx.out(`  Abrí ${code.verification_uri} con tu usuario del backoffice,`);
  ctx.out('  verificá que el código coincida y autorizá la CLI.');
  ctx.out(`  Link directo: ${code.verification_uri_complete}`);
  ctx.out('');
  if (flags.browser !== false && ctx.interactive) {
    // Sólo se abre solo si es https y de la API o del admin de Hermes.
    const confiable = verificacionConfiable(code.verification_uri_complete, api);
    if (!confiable) {
      ctx.out(`  (No abro el navegador: el link no es https de ${new URL(api).hostname} ni de ${ADMIN_HOSTS.join(', ')}.)`);
    } else {
      const ok = await ctx.openBrowser(confiable.href);
      if (!ok) ctx.out('  (No pude abrir el navegador: copiá el link.)');
    }
  }
  ctx.out('  Esperando la aprobación… (Ctrl+C para cancelar)');

  let interval = Math.max(1, code.interval || 5);
  const limite = Math.min(
    (code.expires_in || 600) * 1000 + interval * 1000,
    MAX_ESPERA_MS,
  );
  let esperado = 0;
  while (esperado < limite) {
    await ctx.sleep(interval * 1000);
    esperado += interval * 1000;
    try {
      const t = await cliente.canjear(code.device_code);
      await s.guardar(api, {
        token: t.access_token,
        email: t.user.email,
        name: t.user.name,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });
      ctx.out('');
      ctx.out(`✔ Listo: entraste como ${t.user.email} en ${api}.`);
      if (t.all_tenants === false && t.tenants?.length)
        ctx.out(`  Cuentas autorizadas: ${t.tenants.join(', ')}.`);
      else if (t.all_tenants === true && t.tenants)
        ctx.out('  Cuentas autorizadas: todas tus marcas.');
      ctx.out(
        `  La sesión dura ${Math.round(t.expires_in / 86400)} días. Siguiente paso: \`hermes link\` en la carpeta de tu proyecto.`,
      );
      return;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const error = e.body.error;
      if (error === 'authorization_pending') continue;
      if (error === 'slow_down') {
        const pedido = Number(e.body.interval);
        interval = Number.isFinite(pedido) && pedido > interval ? pedido : interval + 5;
        continue;
      }
      if (error === 'expired_token')
        throw new CliError('El código venció sin aprobarse. Corré `hermes login` de nuevo.');
      if (error === 'access_denied')
        throw new CliError('Se rechazó el acceso desde el admin.');
      throw e;
    }
  }
  throw new CliError('El código venció sin aprobarse. Corré `hermes login` de nuevo.');
}

export async function logout(ctx: Ctx, { flags }: Parsed): Promise<void> {
  const s = store(ctx);
  const api = await s.api(str(flags.api), ctx.env);
  const sesion = await s.sesion(api);
  if (sesion) {
    try {
      await new HermesApi(ctx, api, sesion.token).logout();
    } catch {
      // Ya vencida o revocada: igual se borra local.
    }
  }
  const borrada = await s.borrar(api);
  ctx.out(
    borrada
      ? `✔ Saliste de ${api} (token de la CLI revocado).`
      : `No había una sesión guardada para ${api}.`,
  );
}

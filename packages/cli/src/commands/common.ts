import { HermesApi } from '../api';
import { Parsed, str } from '../args';
import { Ctx } from '../context';
import { CredentialsStore, Sesion } from '../credentials';
import { CliError } from '../errors';

export const store = (ctx: Ctx) => new CredentialsStore(ctx.configDir);

/** La API y la sesión guardada para ella; si no hay, pide `hermes login`. */
export async function conSesion(
  ctx: Ctx,
  flags: Parsed['flags'],
): Promise<{ api: string; sesion: Sesion; cliente: HermesApi }> {
  const s = store(ctx);
  const api = await s.api(str(flags.api), ctx.env);
  const sesion = await s.sesion(api);
  if (!sesion)
    throw new CliError(
      `No estás logueado en ${api}. Corré \`hermes login${api === 'https://api.pow.la' ? '' : ` --api ${api}`}\`.`,
    );
  return { api, sesion, cliente: new HermesApi(ctx, api, sesion.token) };
}

/** Sí/no. Sin terminal interactiva, `porDefecto`. */
export async function confirmar(
  ctx: Ctx,
  pregunta: string,
  porDefecto = false,
): Promise<boolean> {
  if (!ctx.interactive) return porDefecto;
  const r = (await ctx.ask(`${pregunta} ${porDefecto ? '[S/n]' : '[s/N]'} `))
    .trim()
    .toLowerCase();
  if (!r) return porDefecto;
  return ['s', 'si', 'sí', 'y', 'yes'].includes(r);
}

/** Elegir una opción de una lista numerada. */
export async function elegir<T>(
  ctx: Ctx,
  titulo: string,
  opciones: T[],
  etiqueta: (o: T) => string,
): Promise<T> {
  if (opciones.length === 1) return opciones[0];
  if (!ctx.interactive)
    throw new CliError(`${titulo}: hay varias opciones, pasala con un flag.`);
  ctx.out(titulo);
  opciones.forEach((o, i) => ctx.out(`  ${i + 1}) ${etiqueta(o)}`));
  for (;;) {
    const r = await ctx.ask(`Elegí (1-${opciones.length}): `);
    const n = Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= opciones.length)
      return opciones[n - 1];
    ctx.err('  Opción inválida.');
  }
}

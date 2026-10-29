import { Ctx, VERSION } from '../context';

/** El generador de tiendas (`npm create @hermesecommerce/store`). */
export const CREATE_STORE = '@hermesecommerce/create-store';

/**
 * Lo que corre `npx`: el generador de la MISMA major que esta CLI
 * (`@hermesecommerce/create-store@^0`), no `@latest` (una major nueva, o una
 * publicación comprometida con otra major, no entra sola).
 */
export const CREATE_STORE_NPX = `${CREATE_STORE}@^${VERSION.split('.')[0]}`;

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
  const [cmd, args] = local ? ['node', [local, ...argv]] : ['npx', ['--yes', CREATE_STORE_NPX, ...argv]];
  return ctx.spawn(cmd, args, { cwd: ctx.cwd, env: ctx.env });
}

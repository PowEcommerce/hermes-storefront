import { fileURLToPath } from 'node:url';
import { VERSION, ctxReal } from './context';
import { VAR_NO_DELEGAR, aQuienDelegar } from './local';
import { main } from './main';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  process.stderr.write('hermes necesita Node 18 o más nuevo.\n');
  process.exit(1);
}

async function correr(): Promise<number> {
  const argv = process.argv.slice(2);
  const ctx = ctxReal();
  // Dentro de una tienda que fija otra versión de la CLI (devDependency), usar esa.
  const local = await aQuienDelegar(argv, ctx.cwd, fileURLToPath(import.meta.url), VERSION, ctx.env).catch(() => null);
  if (local) {
    ctx.err(
      `⚠ Esta tienda usa @hermesecommerce/cli ${local.version} y la tuya es ${VERSION}: corro la del proyecto. ` +
        'Para actualizarla: `npm install -D @hermesecommerce/cli@latest`.',
    );
    return ctx.spawn(process.execPath, [local.bin, ...argv], { cwd: ctx.cwd, env: { ...ctx.env, [VAR_NO_DELEGAR]: '1' } });
  }
  return main(argv, ctx);
}

correr().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
  },
);

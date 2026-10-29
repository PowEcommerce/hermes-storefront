import { CreateError, crear, ctxReal } from './create';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  process.stderr.write('create-store necesita Node 18 o más nuevo.\n');
  process.exit(1);
}

crear(process.argv.slice(2), ctxReal()).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(e instanceof CreateError ? `✘ ${e.message}\n` : `✘ Error inesperado: ${(e as Error)?.stack ?? e}\n`);
    process.exit(1);
  },
);

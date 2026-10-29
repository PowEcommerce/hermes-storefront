import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

/**
 * La CLI instalada en el proyecto (devDependency del starter). Como la CLI de
 * Shopify: si corrés la global dentro de una tienda que fija otra versión,
 * avisa y usa la del proyecto, para que todo el equipo (y el CI) corra la misma.
 */
export interface CliLocal {
  /** El dist/index.js de la CLI del proyecto. */
  bin: string;
  version: string;
}

/** Variable que corta la delegación (la pone la global al llamar a la local, o a mano). */
export const VAR_NO_DELEGAR = 'HERMES_CLI_NO_DELEGAR';

/** Comandos que nunca se delegan: tocan las credenciales de la máquina. */
const NO_DELEGABLES = new Set(['create', 'login', 'logout']);

/**
 * El bin del paquete, sólo si (con symlinks resueltos) queda DENTRO de la raíz
 * del paquete. Un package.json con `bin: "../../../algo.js"` o un dist/index.js
 * que es un symlink afuera no se ejecuta.
 */
async function binDentroDelPaquete(raiz: string, rel: string): Promise<string | null> {
  try {
    const raizReal = await realpath(raiz);
    const binReal = await realpath(join(raiz, rel));
    return binReal.startsWith(raizReal + sep) ? binReal : null;
  } catch {
    return null;
  }
}

interface PackageJson {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
}

/** Busca node_modules/@hermesecommerce/cli desde `cwd` hacia arriba. */
export async function cliDelProyecto(cwd: string): Promise<CliLocal | null> {
  let dir = cwd;
  for (;;) {
    const raiz = join(dir, 'node_modules', '@hermesecommerce', 'cli');
    let pkg: PackageJson | null = null;
    try {
      pkg = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8')) as PackageJson;
    } catch {
      /* no está acá: subo */
    }
    if (pkg) {
      // Hay algo instalado con ese nombre: o es la CLI de verdad, o no se delega.
      const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.hermes;
      if (pkg.name !== '@hermesecommerce/cli' || !rel || typeof pkg.version !== 'string') return null;
      const bin = await binDentroDelPaquete(raiz, rel);
      return bin ? { bin, version: pkg.version } : null;
    }
    const arriba = dirname(dir);
    if (arriba === dir) return null;
    dir = arriba;
  }
}

/**
 * ¿Esta CLI (`propio`: su dist/index.js) tiene que pasarle el comando a la del
 * proyecto? Sólo si es OTRA instalación y de otra versión.
 */
export async function aQuienDelegar(
  argv: string[],
  cwd: string,
  propio: string,
  version: string,
  env: Record<string, string | undefined>,
): Promise<CliLocal | null> {
  if (env[VAR_NO_DELEGAR]) return null;
  // `create` arma una tienda nueva: no depende del proyecto en el que estés parado.
  // `login`/`logout` manejan las credenciales de la máquina: siempre la CLI que
  // instalaste vos, nunca código del node_modules de un repo que clonaste.
  if (argv.some((a) => NO_DELEGABLES.has(a))) return null;
  const local = await cliDelProyecto(cwd);
  if (!local || local.version === version) return null;
  const real = async (p: string) => realpath(p).catch(() => p);
  if ((await real(local.bin)) === (await real(propio))) return null;
  return local;
}

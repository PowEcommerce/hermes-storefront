import { CliError } from './errors';

/**
 * Los comandos de la CLI que corren scripts del proyecto. Un script que los
 * llame (`"dev": "hermes dev"`) no se puede correr desde ellos: sería un bucle.
 */
export const COMANDOS_QUE_CORREN_SCRIPTS = ['dev', 'preview', 'deploy'] as const;

/**
 * Variable que la CLI pone en los procesos que lanza con los comandos que
 * está corriendo. Si un `hermes dev` arranca con `dev` ya en la lista, alguien
 * lo llamó desde su propio script (aunque sea por un camino indirecto).
 */
export const VAR_CADENA = 'HERMES_CLI_CADENA';

/** ¿El script invoca `hermes <alguno de comandos>`? (hermes, npx hermes, @hermesecommerce/cli…) */
export function invocaHermes(script: string | undefined, comandos: readonly string[] = COMANDOS_QUE_CORREN_SCRIPTS): boolean {
  if (!script) return false;
  const cmds = comandos.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:^|[\\s;&|(/"'])(?:hermes|@hermesecommerce/cli(?:@\\S+)?)\\s+(?:${cmds})(?=$|[\\s;&|)"'])`);
  return re.test(script);
}

export type Ejecucion =
  /** `npm run <script>` */
  | { tipo: 'script'; script: string }
  /** El binario de Next directo (`npx --no next dev`), cuando el script es la propia CLI. */
  | { tipo: 'next'; args: string[] };

export interface Paquete {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const tieneNext = (pkg: Paquete) => Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);

/**
 * Qué correr para un paso (`dev`, `build`, `start`) sin llamarse a sí misma:
 * 1. el primer script de `candidatos` que exista y no invoque a la CLI;
 * 2. si los que existen son la CLI (`"dev": "hermes dev"`) y el proyecto es
 *    Next.js: `next <paso>` directo;
 * 3. si el script llama a la CLI y no es Next.js, un error claro;
 * 4. si no hay ninguno, null (el que llama arma el error con todos los faltantes).
 */
export function resolverPaso(pkg: Paquete, paso: 'dev' | 'build' | 'start', candidatos: string[], comando: string): Ejecucion | null {
  const scripts = pkg.scripts ?? {};
  const existentes = candidatos.filter((s) => scripts[s]);
  const usable = existentes.find((s) => !invocaHermes(scripts[s]));
  if (usable) return { tipo: 'script', script: usable };
  const sugerido = candidatos[0];
  if (existentes.length) {
    if (tieneNext(pkg)) return { tipo: 'next', args: [paso] };
    throw new CliError(
      `El script "${existentes[0]}" (\`${scripts[existentes[0]]}\`) llama a la CLI de Hermes y \`hermes ${comando}\` lo correría en bucle. ` +
        `Agregá un script "${sugerido}" con el comando de tu framework (en Next.js: "${sugerido}": "next ${paso}").`,
    );
  }
  return null;
}

/** Error para los pasos sin ningún script: `faltan` = [paso, candidatos][]. */
export function errorDeScriptsFaltantes(faltan: [string, string[]][]): CliError {
  const nombres = faltan.map(([, c]) => c.map((s) => `"${s}"`).join(' ni '));
  const sugeridos = faltan.map(([paso, c]) => `"${c[0]}": "next ${paso}"`);
  return new CliError(
    `Tu package.json no tiene ${nombres.map((n) => `el script ${n}`).join(' ni ')}. Agregalo (en un proyecto Next.js: ${sugeridos.join(', ')}).`,
  );
}

/** Corta si este comando ya está corriendo más arriba en la misma cadena de procesos. */
export function cortarSiHayBucle(env: Record<string, string | undefined>, comando: string): void {
  const cadena = (env[VAR_CADENA] ?? '').split(',').filter(Boolean);
  if (cadena.includes(comando))
    throw new CliError(
      `\`hermes ${comando}\` se está llamando a sí mismo (cadena: hermes ${[...cadena, comando].join(' → hermes ')}). ` +
        `Revisá los scripts de tu package.json: "dev:next", "build" y "start" tienen que correr tu framework (next dev / next build / next start), no la CLI.`,
    );
}

/** El env de los hijos con este comando sumado a la cadena. */
export function conCadena(env: Record<string, string | undefined>, comando: string): Record<string, string | undefined> {
  const cadena = (env[VAR_CADENA] ?? '').split(',').filter(Boolean);
  return { ...env, [VAR_CADENA]: [...cadena, comando].join(',') };
}

import { execFile, spawn } from 'node:child_process';
import { homedir, hostname, platform } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { comandoParaAbrir } from './browser';

export const VERSION = '0.2.0';
/**
 * User-Agent de los pedidos a la API que no pasan por ApiClient (que manda
 * `clientName`). El WAF de api.pow.la da 403 a los pedidos sin User-Agent; el
 * fetch de Node manda `node`, pero lo ponemos igual por consistencia.
 */
export const USER_AGENT = `hermes-cli/${VERSION}`;
export const API_DEFAULT = 'https://api.pow.la';

/**
 * Todo lo que la CLI toca del mundo de afuera, inyectable para los tests:
 * red, archivos (vía cwd / configDir), terminal, navegador y reloj.
 */
export interface Ctx {
  cwd: string;
  configDir: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  out: (linea: string) => void;
  err: (linea: string) => void;
  /** Pregunta algo y devuelve lo que tipeó el usuario ('' si no es interactivo). */
  ask: (pregunta: string) => Promise<string>;
  interactive: boolean;
  openBrowser: (url: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  clientName: string;
  /**
   * Corre un proceso heredando la terminal (stdout/stderr tal cual) y
   * devuelve su código de salida. Ctrl+C le llega al proceso (no mata a la
   * CLI antes que a él).
   */
  spawn: (cmd: string, args: string[], opts: SpawnOpts) => Promise<number>;
  /**
   * Corre un proceso SIN la terminal y devuelve su código y su stdout (para
   * `git`). Opcional: sin él, la CLI sigue sin la info de git.
   */
  capture?: (cmd: string, args: string[], opts: SpawnOpts) => Promise<{ code: number; stdout: string }>;
}

export interface SpawnOpts {
  cwd: string;
  env: Record<string, string | undefined>;
}

function correr(cmd: string, args: string[], opts: SpawnOpts): Promise<number> {
  return new Promise((resolve) => {
    const hijo = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env as NodeJS.ProcessEnv,
      stdio: 'inherit',
      // npm/pnpm/yarn son .cmd en Windows
      shell: platform() === 'win32',
    });
    // La CLI no se va antes que el hijo: le reenvía Ctrl+C / SIGTERM y
    // espera a que el server cierre (en una terminal el SIGINT ya le llega
    // a todo el grupo; reenviarlo cubre el caso en que no).
    const alInt = () => hijo.kill('SIGINT');
    const alTerm = () => hijo.kill('SIGTERM');
    process.on('SIGINT', alInt);
    process.on('SIGTERM', alTerm);
    const fin = (code: number) => {
      process.off('SIGINT', alInt);
      process.off('SIGTERM', alTerm);
      resolve(code);
    };
    hijo.on('error', () => fin(127));
    hijo.on('close', (code, signal) => fin(code ?? (signal === 'SIGINT' ? 130 : 1)));
  });
}

/** ~/.config/hermes (o $HERMES_CONFIG_DIR, o $XDG_CONFIG_HOME/hermes). */
export function configDirDe(env: Record<string, string | undefined>): string {
  if (env.HERMES_CONFIG_DIR) return env.HERMES_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'hermes');
}

function capturar(cmd: string, args: string[], opts: SpawnOpts): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, env: opts.env as NodeJS.ProcessEnv, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 127) : 0;
        resolve({ code, stdout: String(stdout ?? '') });
      },
    );
  });
}

function abrir(url: string): Promise<boolean> {
  const comando = comandoParaAbrir(url, platform());
  if (!comando) return Promise.resolve(false);
  const [cmd, args] = comando;
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, {
        stdio: 'ignore',
        detached: true,
      });
      p.on('error', () => resolve(false));
      p.unref();
      setTimeout(() => resolve(true), 50);
    } catch {
      resolve(false);
    }
  });
}

export function ctxReal(): Ctx {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    cwd: process.cwd(),
    configDir: configDirDe(process.env),
    env: process.env,
    fetch: globalThis.fetch,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    interactive,
    ask: async (pregunta) => {
      if (!interactive) return '';
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        return (await rl.question(pregunta)).trim();
      } finally {
        rl.close();
      }
    },
    openBrowser: abrir,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    clientName: `hermes-cli ${VERSION} (${platform()}; ${hostname()})`,
    spawn: correr,
    capture: capturar,
  };
}

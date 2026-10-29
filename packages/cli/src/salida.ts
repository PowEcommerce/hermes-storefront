import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ctx } from './context';

/**
 * La salida "propia" de los comandos largos (`hermes deploy`): pasos con
 * spinner en una terminal, una línea por paso sin terminal (CI), y nada en
 * `--json`. Sin dependencias: ANSI a mano.
 */

/** Tokens de Hermes con valor (los mismos prefijos que busca scripts/tarball-sin-internos.sh). */
const TOKENS = /\b(psk|pst|pit|hct|hdt|crt|whsec)_[A-Za-z0-9_-]{4,}/g;
const BEARER = /\b(Bearer)\s+[^\s"'`,;]+/gi;

/**
 * Tapa los tokens de Hermes (`psk_`, `pst_`, `hct_`, `hdt_`, `whsec_`…), los
 * `Bearer …` y los `valores` exactos (secretos del .env o del proyecto) en un
 * texto que se va a mostrar o a guardar en un log.
 */
export function taparSecretos(texto: string, valores: Array<string | undefined> = []): string {
  let t = texto;
  // Los más largos primero (uno puede contener a otro).
  for (const v of [...new Set(valores)].filter((x): x is string => Boolean(x && x.length >= 8)).sort((a, b) => b.length - a.length))
    t = t.split(v).join('****');
  return t.replace(TOKENS, '$1_****').replace(BEARER, '$1 ****');
}

/** Saca los códigos ANSI (colores, cursor) de la salida de un proceso. */
export function sinAnsi(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');
}

/**
 * Ruido conocido de npm, wrangler y OpenNext que no ayuda a entender por qué
 * falló algo (avisos de engines/deprecated/audit, banners, telemetría).
 */
const RUIDO: RegExp[] = [
  /^\s*$/,
  /^npm (warn|WARN|notice|NOTICE)\b/,
  /^npm (error|ERR!) (A complete log|Log files were not written|You can rerun)/,
  /^\s*(added|removed|changed|audited) \d+ packages?/,
  /^\s*\d+ packages? (are|is) looking for funding/,
  /^\s*run `npm fund`/,
  /^\s*found 0 vulnerabilities/,
  /⛅️ wrangler/,
  /^[─━-]{5,}\s*$/,
  /telemetry|Cloudflare collects anonymous|wrangler telemetry/i,
  /^\s*[┌└][─\s]*[┐┘]\s*$/,
  /^\s*│.*│\s*$/,
  // El envoltorio de OpenNext cuando falla `next build` (execSync): frames de
  // Node y de node_modules y el objeto del error, que tapan la causa real.
  /^\s+at .*(node:internal|node_modules[\\/]|\(node:)/,
  /^node:internal\//,
  /^\s*const err = new Error\(message\);\s*$/,
  /^\s*\^\s*$/,
  /^\s+(status|signal|output|pid|stdout|stderr): .*,?$/,
  /^Node\.js v\d+/,
];

export const esRuido = (linea: string) => RUIDO.some((r) => r.test(linea));

/** Las últimas `n` líneas que sirven (sin ANSI ni ruido) de la salida de un proceso. */
export function cola(salida: string, n = 30): string[] {
  const lineas = sinAnsi(salida)
    .split(/\r?\n|\r/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => !esRuido(l));
  return lineas.slice(-n);
}

const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** 6,3 MB · 850 KB (base 1024, en es-AR). */
export function bytes(n: number): string {
  if (n < 1024) return `${ENTERO.format(n)} B`;
  if (n < 1024 * 1024) return `${ENTERO.format(Math.round(n / 1024))} KB`;
  return `${NUM.format(n / (1024 * 1024))} MB`;
}

/** 4,2 s · 1 min 12 s. */
export function duracion(ms: number): string {
  if (ms < 60_000) return `${NUM.format(ms / 1000)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const cantidad = (n: number) => ENTERO.format(n);

/** ¿CI / variable "verdadera"? (`CI=true`, `CI=1`; no `CI=false` ni `CI=0`). */
export const activa = (v: string | undefined) => Boolean(v && !['0', 'false', 'no', ''].includes(v.trim().toLowerCase()));

export interface Colores {
  verde: (s: string) => string;
  rojo: (s: string) => string;
  amarillo: (s: string) => string;
  tenue: (s: string) => string;
  negrita: (s: string) => string;
  cian: (s: string) => string;
}

/** Colores sólo en una terminal, sin NO_COLOR ni TERM=dumb. */
export function colores(ctx: Ctx): Colores {
  const si = Boolean(ctx.tty) && ctx.env.NO_COLOR === undefined && ctx.env.TERM !== 'dumb';
  const c = (a: number, b: number) => (s: string) => (si ? `\x1b[${a}m${s}\x1b[${b}m` : s);
  return { verde: c(32, 39), rojo: c(31, 39), amarillo: c(33, 39), tenue: c(2, 22), negrita: c(1, 22), cian: c(36, 39) };
}

/**
 * - `spinner`: terminal interactiva (no CI): un spinner por paso.
 * - `lineas`: sin terminal o en CI: una línea por paso, al terminarlo.
 * - `verbose`: la salida cruda de los procesos, con una línea al empezar y
 *   otra al terminar cada paso.
 * - `json`: nada (el comando imprime un JSON al final).
 */
export type Modo = 'spinner' | 'lineas' | 'verbose' | 'json';

export function modoDeSalida(ctx: Ctx, flags: { verbose?: unknown; json?: unknown }): Modo {
  if (flags.json === true) return 'json';
  if (flags.verbose === true || activa(ctx.env.HERMES_VERBOSE)) return 'verbose';
  if (ctx.tty && ctx.write && !activa(ctx.env.CI) && ctx.env.TERM !== 'dumb') return 'spinner';
  return 'lineas';
}

const CUADROS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Avance: cambia el texto del paso mientras corre (p. ej. «Subiendo a Hermes (3/21)»). */
export type Avance = (texto: string) => void;

export class Pasos {
  readonly c: Colores;
  constructor(
    private readonly ctx: Ctx,
    readonly modo: Modo,
  ) {
    this.c = colores(ctx);
  }

  /** Una línea para la persona (no sale en `--json`: va a stderr). */
  nota(linea: string): void {
    if (this.modo === 'json') this.ctx.err(linea);
    else this.ctx.out(linea);
  }

  /**
   * Corre `fn` como un paso: «⠋ titulo…» mientras corre y `✔ <fin(r)>` al
   * terminar; si tira, `✘ titulo` y el error sigue para arriba.
   */
  async paso<T>(titulo: string, fn: (avance: Avance) => Promise<T>, fin: (r: T) => string): Promise<T> {
    const { c, ctx } = this;
    if (this.modo === 'json') return fn(() => {});
    if (this.modo === 'verbose') ctx.out(c.tenue(`› ${titulo}…`));
    let texto = titulo;
    let timer: ReturnType<typeof setInterval> | undefined;
    const inicio = Date.now();
    if (this.modo === 'spinner') {
      let i = 0;
      const dibujar = () => {
        const seg = Math.floor((Date.now() - inicio) / 1000);
        ctx.write!(`\r\x1b[2K${c.cian(CUADROS[i++ % CUADROS.length])} ${texto}…${seg >= 2 ? c.tenue(` ${seg} s`) : ''}`);
      };
      dibujar();
      timer = setInterval(dibujar, 80);
    }
    const limpiar = () => {
      if (timer) {
        clearInterval(timer);
        ctx.write!('\r\x1b[2K');
      }
    };
    try {
      const r = await fn((t) => (texto = t));
      limpiar();
      ctx.out(`${c.verde('✔')} ${fin(r)}`);
      return r;
    } catch (e) {
      limpiar();
      ctx.out(`${c.rojo('✘')} ${titulo}`);
      throw e;
    }
  }
}

/** Dónde quedan los logs completos de `hermes deploy` (en el .gitignore). */
export const LOGS = join('.hermes', 'logs');
const LOGS_GUARDADOS = 10;

/**
 * Guarda el log completo (ya sin secretos) en `.hermes/logs/<prefijo>-<fecha>.log`
 * y deja sólo los últimos 10. Devuelve la ruta relativa al proyecto.
 */
export async function guardarLog(cwd: string, prefijo: string, texto: string, ahora = new Date()): Promise<string> {
  const dir = join(cwd, LOGS);
  await mkdir(dir, { recursive: true });
  const p = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
  let nombre = `${prefijo}-${fecha}.log`;
  const existentes = await readdir(dir).catch(() => [] as string[]);
  for (let i = 2; existentes.includes(nombre); i++) nombre = `${prefijo}-${fecha}-${i}.log`;
  await writeFile(join(dir, nombre), texto, { mode: 0o600 });
  const viejos = existentes.filter((f) => f.startsWith(`${prefijo}-`) && f.endsWith('.log')).sort();
  for (const f of viejos.slice(0, Math.max(0, viejos.length + 1 - LOGS_GUARDADOS))) await rm(join(dir, f), { force: true });
  return join(LOGS, nombre);
}

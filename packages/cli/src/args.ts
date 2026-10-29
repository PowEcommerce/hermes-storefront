import { CliError } from './errors';

export interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

/**
 * Parser mínimo: `--flag valor`, `--flag=valor`, `--flag` (booleano),
 * `--no-flag` (false) y flags repetibles (`--domain a --domain b`).
 * `booleanos` dice cuáles no llevan valor.
 */
export function parseArgs(
  argv: string[],
  booleanos: string[] = [],
  repetibles: string[] = [],
): Parsed {
  const positional: string[] = [];
  const flags: Parsed['flags'] = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith('--') || a === '--') {
      if (a === '-h') flags.help = true;
      else positional.push(a);
      continue;
    }
    let nombre = a.slice(2);
    let valor: string | boolean | undefined;
    const igual = nombre.indexOf('=');
    if (igual >= 0) {
      valor = nombre.slice(igual + 1);
      nombre = nombre.slice(0, igual);
    } else if (nombre.startsWith('no-') && booleanos.includes(nombre.slice(3))) {
      nombre = nombre.slice(3);
      valor = false;
    } else if (booleanos.includes(nombre) || nombre === 'help') {
      valor = true;
    } else {
      const sig = argv[i + 1];
      if (sig === undefined || sig.startsWith('--'))
        throw new CliError(`Falta el valor de --${nombre}`);
      valor = sig;
      i++;
    }
    if (repetibles.includes(nombre)) {
      const prev = flags[nombre];
      flags[nombre] = [...(Array.isArray(prev) ? prev : []), String(valor)];
    } else flags[nombre] = valor;
  }
  return { positional, flags };
}

export const str = (v: Parsed['flags'][string]): string | undefined =>
  typeof v === 'string' ? v : undefined;

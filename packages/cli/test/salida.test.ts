import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytes, cola, duracion, guardarLog, modoDeSalida, sinAnsi, taparSecretos } from '../src/salida';
import { Ctx } from '../src/context';

describe('taparSecretos', () => {
  it('tapa los tokens de Hermes, los Bearer y los valores exactos', () => {
    const t = taparSecretos(
      [
        `psk_${'a'.repeat(30)} pst_${'b'.repeat(30)} hct_${'c'.repeat(30)} hdt_${'d'.repeat(30)} whsec_${'e'.repeat(30)}`,
        'authorization: Bearer abc.def-123',
        'CMS_TOKEN=mi-secreto-del-cms',
      ].join('\n'),
      ['mi-secreto-del-cms', 'corto'],
    );
    expect(t).toBe(['psk_**** pst_**** hct_**** hdt_**** whsec_****', 'authorization: Bearer ****', 'CMS_TOKEN=****'].join('\n'));
  });

  it('no toca texto común ni valores cortos', () => {
    expect(taparSecretos('wrangler deploy --dry-run · pst_ (prefijo)', ['corto'])).toBe('wrangler deploy --dry-run · pst_ (prefijo)');
  });
});

describe('cola', () => {
  it('las últimas N líneas útiles, sin ANSI ni ruido de npm/wrangler/OpenNext', () => {
    const salida = [
      'npm warn EBADENGINE Unsupported engine',
      'npm warn deprecated glob@7',
      '┌─────────┐',
      '│ OpenNext │',
      '└─────────┘',
      ' ⛅️ wrangler 4.155.0',
      '\x1b[31mError: algo\x1b[39m',
      '',
      ...Array.from({ length: 40 }, (_, i) => `línea ${i}`),
    ].join('\n');
    const c = cola(salida, 30);
    expect(c).toHaveLength(30);
    expect(c.at(-1)).toBe('línea 39');
    expect(cola(salida, 100)[0]).toBe('Error: algo');
  });

  it('saca el envoltorio de OpenNext cuando falla next build (frames de Node y el objeto del error)', () => {
    const salida = [
      '> Build error occurred',
      'Error: Failed to collect page data for /x',
      'node:internal/errors:983',
      '  const err = new Error(message);',
      '              ^',
      'Error: Command failed: npm run build',
      '    at genericNodeError (node:internal/errors:983:15)',
      '    at build (file:///p/node_modules/@opennextjs/cloudflare/dist/cli/build/build.js:64:9)',
      '  status: 1,',
      '  pid: 95282,',
      '  stderr: null',
      '}',
      'Node.js v23.7.0',
    ].join('\n');
    expect(cola(salida)).toEqual([
      '> Build error occurred',
      'Error: Failed to collect page data for /x',
      'Error: Command failed: npm run build',
      '}',
    ]);
  });

  it('sinAnsi saca colores y movimientos de cursor', () => {
    expect(sinAnsi('\x1b[2K\r\x1b[36m⠋\x1b[39m hola')).toBe('\r⠋ hola');
  });
});

describe('formatos (es-AR)', () => {
  it('bytes y duración', () => {
    expect(bytes(512)).toBe('512 B');
    expect(bytes(850 * 1024)).toBe('850 KB');
    expect(bytes(6.3 * 1024 * 1024)).toBe('6,3 MB');
    expect(duracion(4200)).toBe('4,2 s');
    expect(duracion(72_000)).toBe('1 min 12 s');
  });
});

describe('modoDeSalida', () => {
  const ctx = (o: Partial<Ctx>) => ({ env: {}, ...o }) as Ctx;
  it('json > verbose > spinner (terminal, no CI) > líneas', () => {
    const w = () => {};
    expect(modoDeSalida(ctx({ tty: true, write: w }), { json: true, verbose: true })).toBe('json');
    expect(modoDeSalida(ctx({ tty: true, write: w }), { verbose: true })).toBe('verbose');
    expect(modoDeSalida(ctx({ tty: true, write: w, env: { HERMES_VERBOSE: '1' } }), {})).toBe('verbose');
    expect(modoDeSalida(ctx({ tty: true, write: w, env: { HERMES_VERBOSE: '0' } }), {})).toBe('spinner');
    expect(modoDeSalida(ctx({ tty: true, write: w, env: { CI: 'true' } }), {})).toBe('lineas');
    expect(modoDeSalida(ctx({ tty: true, write: w, env: { CI: 'false' } }), {})).toBe('spinner');
    expect(modoDeSalida(ctx({ tty: false }), {})).toBe('lineas');
  });
});

describe('guardarLog', () => {
  it('guarda en .hermes/logs/deploy-<fecha>.log (600) y deja los últimos 10', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'hermes-log-'));
    const rutas: string[] = [];
    for (let i = 0; i < 12; i++) rutas.push(await guardarLog(cwd, 'deploy', `log ${i}`, new Date(2026, 9, 29, 16, 55, i)));
    expect(rutas[0]).toBe(join('.hermes', 'logs', 'deploy-2026-10-29-165500.log'));
    const quedan = (await readdir(join(cwd, '.hermes/logs'))).sort();
    expect(quedan).toHaveLength(10);
    expect(quedan[0]).toBe('deploy-2026-10-29-165502.log');
    expect(await readFile(join(cwd, rutas[11]), 'utf8')).toBe('log 11');
    if (process.platform !== 'win32') expect((await stat(join(cwd, rutas[11]))).mode & 0o777).toBe(0o600);
    // Mismo segundo: no se pisa.
    const otra = await guardarLog(cwd, 'deploy', 'otro', new Date(2026, 9, 29, 16, 55, 11));
    expect(otra).toBe(join('.hermes', 'logs', 'deploy-2026-10-29-165511-2.log'));
  });
});

import { describe, expect, it } from 'vitest';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  actualizarEnv,
  asegurarGitignore,
  escribirEnv,
  ignoraEnv,
  leerVariable,
} from '../src/env-file';

describe('actualizarEnv', () => {
  it('agrega al final sin tocar lo demás (comentarios, orden, otras variables)', () => {
    const antes = '# mi app\nDATABASE_URL=postgres://x\n\nNEXT_PUBLIC_X=1\n';
    const r = actualizarEnv(antes, { HERMES_TENANT: 'mimarca', HERMES_PUBLIC_TOKEN: 'pst_1' });
    expect(r).toBe(
      '# mi app\nDATABASE_URL=postgres://x\n\nNEXT_PUBLIC_X=1\n\n# Hermes (escrito por `hermes link`)\nHERMES_TENANT=mimarca\nHERMES_PUBLIC_TOKEN=pst_1\n',
    );
  });

  it('reemplaza en su lugar (también con export y comillas) y deduplica', () => {
    const antes = 'A=1\nexport HERMES_TENANT="viejo"\nB=2\nHERMES_TENANT=otro\n';
    expect(actualizarEnv(antes, { HERMES_TENANT: 'mimarca' })).toBe(
      'A=1\nHERMES_TENANT=mimarca\nB=2\n',
    );
  });

  it('undefined borra; si no quedan HERMES_*, se va el comentario', () => {
    const conLink = actualizarEnv('A=1\n', { HERMES_TENANT: 's', HERMES_PRIVATE_TOKEN: 'psk_1' });
    const sin = actualizarEnv(conLink, { HERMES_TENANT: undefined, HERMES_PRIVATE_TOKEN: undefined });
    expect(sin).toBe('A=1\n');
    expect(actualizarEnv('', { X: undefined })).toBe('');
  });

  it('archivo sin \\n final y CRLF', () => {
    expect(actualizarEnv('A=1', { HERMES_TENANT: 's' })).toBe(
      'A=1\n\n# Hermes (escrito por `hermes link`)\nHERMES_TENANT=s\n',
    );
    expect(actualizarEnv('A=1\r\nHERMES_TENANT=x\r\n', { HERMES_TENANT: 'y' })).toBe(
      'A=1\nHERMES_TENANT=y\n',
    );
  });

  it('valores con espacios o # van entre comillas; leerVariable las saca', () => {
    const r = actualizarEnv('', { X: 'a b#c' });
    expect(r).toContain('X="a b#c"');
    expect(leerVariable(r, 'X')).toBe('a b#c');
    expect(leerVariable('export Y=\'z\'\n', 'Y')).toBe('z');
    expect(leerVariable('Y=1\n', 'Z')).toBeUndefined();
  });
});

describe('archivos', () => {
  it('escribirEnv crea .env con permisos 600 y conserva lo existente', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'env-'));
    await escribirEnv(dir, { HERMES_TENANT: 'mimarca' });
    expect((await stat(join(dir, '.env'))).mode & 0o777).toBe(0o600);
    await writeFile(join(dir, '.env'), 'OTRA=1\n');
    await escribirEnv(dir, { HERMES_TENANT: 'tercera' });
    expect(await readFile(join(dir, '.env'), 'utf8')).toContain('OTRA=1\n');
  });

  it('asegurarGitignore agrega .env una sola vez', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gi-'));
    await writeFile(join(dir, '.gitignore'), 'node_modules');
    expect(await asegurarGitignore(dir)).toBe(true);
    expect(await asegurarGitignore(dir)).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.env\n');
    expect(ignoraEnv('.env*\n')).toBe(true);
    expect(ignoraEnv('.env.local\n')).toBe(false);
  });
});

describe('ignorarEnGit', () => {
  it('agrega la línea una sola vez (con o sin barra final)', async () => {
    const { mkdtemp, readFile, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { ignorarEnGit } = await import('../src/env-file');
    const dir = await mkdtemp(join(tmpdir(), 'hermes-gi-'));
    await writeFile(join(dir, '.gitignore'), 'node_modules\n.open-next');
    expect(await ignorarEnGit(dir, '.open-next/')).toBe(false);
    expect(await ignorarEnGit(dir, '.hermes/build/')).toBe(true);
    expect(await ignorarEnGit(dir, '.hermes/build/')).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.open-next\n.hermes/build/\n');
  });
});

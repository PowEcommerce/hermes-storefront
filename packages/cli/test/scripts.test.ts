import { describe, expect, it } from 'vitest';
import { invocaHermes, resolverPaso } from '../src/scripts';

describe('invocaHermes', () => {
  it.each([
    ['hermes dev', true],
    ['hermes dev --open', true],
    ['npx hermes deploy', true],
    ['npx --yes @hermesecommerce/cli preview', true],
    ['npx @hermesecommerce/cli@0.1.0 dev', true],
    ['./node_modules/.bin/hermes dev', true],
    ['next build && hermes deploy', true],
    ['next dev', false],
    ['hermes login', false],
    ['hermes link', false],
    ['hermes-dev-tool dev', false],
    ['echo hermesdev', false],
  ])('%s → %s', (script, esperado) => {
    expect(invocaHermes(script)).toBe(esperado);
  });
});

describe('resolverPaso', () => {
  const next = { dependencies: { next: '16' } };
  it('prefiere el primer candidato que no llama a la CLI', () => {
    expect(resolverPaso({ ...next, scripts: { dev: 'hermes dev', 'dev:next': 'next dev' } }, 'dev', ['dev:next', 'dev'], 'dev')).toEqual({
      tipo: 'script',
      script: 'dev:next',
    });
  });
  it('sin scripts: null', () => {
    expect(resolverPaso({ scripts: {} }, 'dev', ['dev:next', 'dev'], 'dev')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { main } from '../src/main';
import { avisoDeNode, nodeSoportado } from '../src/node';
import { apiFalsa, ctxDePrueba } from './helpers';

describe('versión de Node', () => {
  it.each(['20.9.0', '20.18.1', 'v22.11.0', '24.0.0', '25.1.0'])('%s está soportada', (v) => {
    expect(nodeSoportado(v)).toBe(true);
    expect(avisoDeNode(v)).toBeNull();
  });
  it.each(['18.20.0', '20.8.1', '21.7.3', '23.7.0'])('%s no: aviso con la recomendada', (v) => {
    expect(nodeSoportado(v)).toBe(false);
    expect(avisoDeNode(v)).toContain(`Estás con Node ${v}; recomendamos Node 22 LTS (o 20/24)`);
  });

  it('dev/deploy avisan pero siguen; whoami y el resto no avisan', async () => {
    const t = await ctxDePrueba(apiFalsa(() => undefined).fetch);
    t.ctx.nodeVersion = '23.7.0';
    // Sin proyecto linkeado, dev falla por eso (no por Node), después del aviso.
    expect(await main(['dev'], t.ctx)).toBe(1);
    expect(t.err[0]).toContain('Estás con Node 23.7.0');
    expect(t.err.join('\n')).toContain('no está linkeada');
    t.err.length = 0;
    expect(await main(['deploy'], t.ctx)).toBe(1);
    expect(t.err[0]).toContain('Estás con Node 23.7.0');
    t.err.length = 0;
    await main(['whoami'], t.ctx);
    expect(t.err.join('\n')).not.toContain('Estás con Node');
  });
});

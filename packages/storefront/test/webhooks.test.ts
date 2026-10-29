import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhook } from '../src';

const SECRET = 'whsec_' + 'c'.repeat(40);
const firmar = (raw: string, secret = SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
const ahora = Date.parse('2026-10-26T15:04:05.123Z');
const evento = (ts = '2026-10-26T15:04:05.123Z') =>
  JSON.stringify({
    event: 'checkout/completed',
    id: '18342',
    timestamp: ts,
    checkout_session: {
      id: 'cs_1',
      status: 'completed',
      order_id: 987,
      amount: 45999.9,
      currency: 'ARS',
    },
  });

describe('verifyWebhook', () => {
  it('válido (string y bytes)', async () => {
    const raw = evento();
    const r = await verifyWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.id).toBe('18342');
    const r2 = await verifyWebhook({
      rawBody: new TextEncoder().encode(raw),
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
    });
    expect(r2.ok).toBe(true);
  });

  it('firma mala: otro secreto, cuerpo tocado, formato roto o sin header', async () => {
    const raw = evento();
    const otro = await verifyWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw, 'whsec_otro'),
      secret: SECRET,
      now: ahora,
    });
    expect(otro).toMatchObject({ ok: false, reason: 'invalid_signature' });
    const tocado = await verifyWebhook({
      rawBody: raw.replace('45999.9', '1'),
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
    });
    expect(tocado).toMatchObject({ ok: false, reason: 'invalid_signature' });
    const roto = await verifyWebhook({
      rawBody: raw,
      signatureHeader: 'md5=abc',
      secret: SECRET,
      now: ahora,
    });
    expect(roto).toMatchObject({ ok: false, reason: 'malformed_signature' });
    const sin = await verifyWebhook({
      rawBody: raw,
      signatureHeader: null,
      secret: SECRET,
      now: ahora,
    });
    expect(sin).toMatchObject({ ok: false, reason: 'missing_signature' });
  });

  it('viejo (fuera de tolerancia) y tolerancia configurable', async () => {
    const raw = evento('2026-10-26T14:50:00.000Z'); // 14 min antes
    const viejo = await verifyWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
    });
    expect(viejo).toMatchObject({
      ok: false,
      reason: 'timestamp_out_of_range',
    });
    const tolerante = await verifyWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
      toleranceSec: 3600,
    });
    expect(tolerante.ok).toBe(true);
  });

  it('firmado pero sin timestamp: inválido', async () => {
    const raw = JSON.stringify({ event: 'webhook/test', id: '1' });
    const r = await verifyWebhook({
      rawBody: raw,
      signatureHeader: firmar(raw),
      secret: SECRET,
      now: ahora,
    });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_body' });
  });
});

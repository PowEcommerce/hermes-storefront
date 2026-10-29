import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../src/main';
import { CredentialsStore } from '../src/credentials';
import { Llamada, SESION, apiFalsa, ctxDePrueba } from './helpers';

const REMITENTE = {
  from_name: null,
  from_address: null,
  reply_to: null,
  default_from_address: 'no-reply@pow.la',
  effective: { via: 'plataforma', from: 'Mimarca <no-reply@pow.la>', reply_to: 'hola@mimarca.com' },
  managed_by_pow: false,
  fallback_reason: null,
};

const DOMINIO = {
  domain: 'mimarca.com',
  status: 'pending',
  source: 'cli',
  mail_from_domain: 'bounce.mimarca.com',
  last_error: null,
  dns_records: [
    { type: 'CNAME', name: 't1._domainkey.mimarca.com', value: 't1.dkim.ejemplo.test', priority: null, purpose: 'dkim', status: 'pending' },
    { type: 'MX', name: 'bounce.mimarca.com', value: 'feedback-smtp.ejemplo.test', priority: 10, purpose: 'mail_from_mx', status: 'pending' },
    { type: 'TXT', name: 'bounce.mimarca.com', value: 'v=spf1 include:ejemplo.test ~all', priority: null, purpose: 'mail_from_spf', status: 'pending' },
  ],
  suggested_records: [
    { type: 'TXT', name: '_dmarc.mimarca.com', value: 'v=DMARC1; p=none; rua=mailto:dmarc@mimarca.com', status: 'missing' },
  ],
};

function api() {
  return apiFalsa((c: Llamada) => {
    if (c.auth !== `Bearer ${SESION.token}`) return { status: 401, body: { error: 'x' } };
    const base = '/api/cli/tenants/mimarca';
    if (c.method === 'GET' && c.path === `${base}/mail-domains`)
      return { body: { available: true, ses_enabled: true, sender: REMITENTE, mail_domains: [DOMINIO], warnings: [] } };
    if (c.method === 'POST' && c.path === `${base}/mail-domains`)
      return { status: 201, body: { mail_domain: { ...DOMINIO, domain: c.body.domain }, warnings: [] } };
    if (c.method === 'POST' && c.path === `${base}/mail-domains/mimarca.com/verify`)
      return { body: { mail_domain: { ...DOMINIO, status: 'verified' }, warnings: [] } };
    if (c.method === 'DELETE' && c.path === `${base}/mail-domains/mimarca.com`)
      return { body: { removed: 'mimarca.com', sender_reset: true, warnings: [] } };
    if (c.method === 'PUT' && c.path === `${base}/mail-sender`) {
      if (c.body.from_address === 'ventas@otra.com')
        return { status: 422, body: { error: 'Primero autenticá otra.com (Autenticar dominio) y esperá a que se verifique' } };
      return {
        body: {
          success: true,
          message: 'Remitente actualizado',
          sender: {
            ...REMITENTE,
            from_address: c.body.from_address ?? null,
            effective: {
              via: c.body.from_address ? 'ses_marca' : 'plataforma',
              from: `Mimarca <${c.body.from_address ?? 'no-reply@pow.la'}>`,
              reply_to: c.body.reply_to ?? 'hola@mimarca.com',
            },
          },
        },
      };
    }
    return undefined;
  });
}

async function linkeado() {
  const a = api();
  const t = await ctxDePrueba(a.fetch);
  await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
  await mkdir(join(t.cwd, '.hermes'));
  await writeFile(
    join(t.cwd, '.hermes', 'project.json'),
    JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', linked_at: 'x' }),
  );
  return { ...t, api: a };
}

describe('hermes mail-domains', () => {
  it('add: muestra los CNAME de DKIM, el MX/TXT del MAIL FROM y el DMARC sugerido', async () => {
    const t = await linkeado();
    expect(await main(['mail-domains', 'add', 'mimarca.com'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/cli/tenants/mimarca/mail-domains',
      body: { domain: 'mimarca.com' },
    });
    const out = t.out.join('\n');
    expect(out).toContain('CNAME t1._domainkey.mimarca.com  →  t1.dkim.ejemplo.test');
    expect(out).toContain('MX    bounce.mimarca.com  →  10 feedback-smtp.ejemplo.test');
    expect(out).toContain('v=spf1 include:ejemplo.test ~all');
    expect(out).toContain('Recomendado (DMARC)');
    expect(out).toContain('hermes mail-sender set ventas@mimarca.com');
  });

  it('list: con qué remitente salen hoy (Pow con el nombre de la marca) y los dominios', async () => {
    const t = await linkeado();
    expect(await main(['mail-domains', 'list'], t.ctx)).toBe(0);
    const out = t.out.join('\n');
    expect(out).toContain('Tus mails salen como: Mimarca <no-reply@pow.la>');
    expect(out).toContain('Las respuestas van a: hola@mimarca.com');
    expect(out).toContain('○ pendiente  mimarca.com');
  });

  it('verify y remove (remove pide --yes sin terminal)', async () => {
    const t = await linkeado();
    expect(await main(['mail-domains', 'verify', 'mimarca.com'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('● verificado  mimarca.com');
    expect(await main(['mail-domains', 'remove', 'mimarca.com'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/--yes/);
    expect(await main(['mail-domains', 'remove', 'mimarca.com', '--yes'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('vuelven a salir desde la dirección de Pow');
  });
});

describe('hermes mail-sender', () => {
  it('set <email> --reply-to: manda el PUT y muestra el remitente nuevo', async () => {
    const t = await linkeado();
    expect(
      await main(['mail-sender', 'set', 'ventas@mimarca.com', '--reply-to', 'atencion@mimarca.com'], t.ctx),
    ).toBe(0);
    expect(t.api.llamadas.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/api/cli/tenants/mimarca/mail-sender',
      body: { from_address: 'ventas@mimarca.com', reply_to: 'atencion@mimarca.com' },
    });
    expect(t.out.join('\n')).toContain('Tus mails salen como: Mimarca <ventas@mimarca.com>');
  });

  it('set pow: vuelve a la dirección de Pow (from_address null)', async () => {
    const t = await linkeado();
    expect(await main(['mail-sender', 'set', 'pow'], t.ctx)).toBe(0);
    expect(t.api.llamadas.at(-1)!.body).toEqual({ from_address: null });
  });

  it('un dominio sin verificar: el error de la API llega tal cual', async () => {
    const t = await linkeado();
    expect(await main(['mail-sender', 'set', 'ventas@otra.com'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toMatch(/Primero autenticá otra\.com/);
  });

  it('sin argumentos muestra el remitente actual', async () => {
    const t = await linkeado();
    expect(await main(['mail-sender'], t.ctx)).toBe(0);
    expect(t.out.join('\n')).toContain('Mimarca <no-reply@pow.la>');
  });
});

describe('hermes mail-domains (marca no habilitada)', () => {
  it('list avisa que no está disponible; add muestra el 403 de la API', async () => {
    const a = apiFalsa((c: Llamada) => {
      const base = '/api/cli/tenants/mimarca';
      if (c.method === 'GET' && c.path === `${base}/mail-domains`)
        return { body: { available: false, ses_enabled: true, sender: REMITENTE, mail_domains: [], warnings: [] } };
      if (c.method === 'POST' && c.path === `${base}/mail-domains`)
        return { status: 403, body: { error: 'Todavía no disponible para tu marca' } };
      return undefined;
    });
    const t = await ctxDePrueba(a.fetch);
    await new CredentialsStore(t.configDir).guardar('https://api.pow.la', SESION);
    await mkdir(join(t.cwd, '.hermes'));
    await writeFile(
      join(t.cwd, '.hermes', 'project.json'),
      JSON.stringify({ tenant: 'mimarca', project_name: 'tienda', api: 'https://api.pow.la', linked_at: 'x' }),
    );
    expect(await main(['mail-domains', 'list'], t.ctx)).toBe(0);
    const out = t.out.join('\n');
    expect(out).toContain('todavía no está disponible para tu marca');
    expect(out).not.toContain('hermes mail-domains add <dominio>');
    expect(await main(['mail-domains', 'add', 'mimarca.com'], t.ctx)).toBe(1);
    expect(t.err.join('\n')).toContain('Todavía no disponible para tu marca');
  });
});

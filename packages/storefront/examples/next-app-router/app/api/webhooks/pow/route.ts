// Webhook checkout/completed: verificar firma + timestamp, deduplicar por id
// y contestar 2xx rápido (procesar en segundo plano).
import { verifyWebhook } from '@hermesecommerce/storefront';

export async function POST(req: Request) {
  const r = await verifyWebhook({
    rawBody: await req.text(), // el cuerpo CRUDO, antes de parsear
    signatureHeader: req.headers.get('x-webhook-signature'),
    secret: process.env.HERMES_WEBHOOK_SECRET!,
  });
  if (!r.ok) return new Response(r.message, { status: r.reason === 'timestamp_out_of_range' ? 400 : 401 });

  // if (await yaProcesado(r.event.id)) return new Response(null, { status: 200 });
  if (r.event.event === 'checkout/completed') {
    // await encolar(r.event.checkout_session);
  }
  return new Response(null, { status: 200 });
}

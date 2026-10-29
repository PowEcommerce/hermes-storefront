// La vuelta del checkout: NUNCA confiar en la query; el estado real se lee
// server-side con el token PRIVADO.
import { pow } from '@/lib/pow';

export const dynamic = 'force-dynamic';

export default async function Gracias({
  searchParams,
}: {
  searchParams: Promise<{ checkout_session_id?: string }>;
}) {
  const { checkout_session_id } = await searchParams;
  if (!checkout_session_id) return <p>Falta la sesión.</p>;
  const s = await pow.checkoutSessions.get(checkout_session_id);
  if (s.status !== 'completed') return <p>Tu compra todavía no se completó.</p>;
  return (
    <main>
      <h1>¡Gracias por tu compra!</h1>
      <p>
        Pedido #{s.order_id} — {s.payment_status === 'paid' ? 'pagado' : 'pendiente de pago'}
      </p>
    </main>
  );
}

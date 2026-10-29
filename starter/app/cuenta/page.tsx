// Mi cuenta: datos del comprador y sus pedidos. El access token dura 15 min;
// si venció y hay refresh, pasamos por /api/cuenta/refresh (que puede escribir
// cookies) y volvemos.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CustomerOrders } from '@hermesecommerce/storefront';
import { hermes } from '@/lib/hermes';
import { leerSesion } from '@/lib/cookies';
import { mensajeDeError } from '@/lib/errors';
import { normalizarMonto } from '@/lib/precios';
import { SubmitButton } from '@/components/SubmitButton';
import { salir } from './actions';

export const metadata: Metadata = { title: 'Mi cuenta', robots: { index: false } };

const REFRESCAR = '/api/cuenta/refresh?volver=/cuenta';

export default async function CuentaPage() {
  const { accessToken, refreshToken } = await leerSesion();
  if (!accessToken) redirect(refreshToken ? REFRESCAR : '/cuenta/ingresar');

  const me = await hermes.account.me(accessToken);
  if (!me.logged || !me.user) redirect(refreshToken ? REFRESCAR : '/cuenta/ingresar');

  let pedidos: CustomerOrders | null = null;
  let error: string | null = null;
  try {
    pedidos = await hermes.account.orders(accessToken, { page: 1, per: 20 });
  } catch (e) {
    error = mensajeDeError(e, 'No pudimos cargar tus pedidos.');
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Hola, {me.user.first_name || me.user.email}</h1>
          <p className="text-sm text-muted-fg">{me.user.email}</p>
        </div>
        <form action={salir}>
          <SubmitButton className="btn-outline h-9" pendingText="Saliendo…">
            Cerrar sesión
          </SubmitButton>
        </form>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Mis pedidos</h2>
        {error && <p className="text-danger">{error}</p>}
        {pedidos && pedidos.orders.length === 0 && <p className="text-muted-fg">Todavía no hiciste ninguna compra.</p>}
        {pedidos && pedidos.orders.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-fg">
              <tr>
                <th className="py-2 font-normal">Pedido</th>
                <th className="py-2 font-normal">Fecha</th>
                <th className="py-2 font-normal">Estado</th>
                <th className="py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pedidos.orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3">#{o.id}</td>
                  <td className="py-3">{o.date}</td>
                  <td className="py-3">{o.state}</td>
                  <td className="py-3 text-right">{normalizarMonto(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

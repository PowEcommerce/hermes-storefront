import type { Metadata } from 'next';
import Link from 'next/link';
import type { Cart } from '@hermesecommerce/storefront';
import { hermes } from '@/lib/hermes';
import { leerCarrito } from '@/lib/cookies';
import { mensajeDeError, mensajeDeErrorDeUrl } from '@/lib/errors';
import { formatearCentavos, normalizarMonto } from '@/lib/precios';
import { finalizarCompra } from '@/app/checkout/actions';
import { CartLine } from '@/components/CartLine';
import { CouponForm } from '@/components/CouponForm';
import { SubmitButton } from '@/components/SubmitButton';

export const metadata: Metadata = { title: 'Carrito' };

// El carrito nunca se cachea: depende de la cookie del comprador.
export default async function CarritoPage({ searchParams }: PageProps<'/carrito'>) {
  // ?error= trae sólo un código (lo pone la action del checkout): nunca texto de la API.
  const error = mensajeDeErrorDeUrl((await searchParams).error);
  const token = await leerCarrito();
  let cart: Cart | null = null;
  let fallo: string | null = null;
  try {
    cart = await hermes.cart.get(token);
  } catch (e) {
    fallo = mensajeDeError(e, 'No pudimos cargar tu carrito.');
  }

  if (fallo) return <p className="text-danger">{fallo}</p>;
  if (!cart?.has_entries)
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-semibold">Tu carrito está vacío</h1>
        <Link href="/" className="btn">
          Seguir comprando
        </Link>
      </div>
    );

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-6 text-2xl font-semibold">Carrito</h1>
        {error && (
          <p role="alert" className="mb-4 rounded-brand border border-danger p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <ul className="divide-y divide-border border-y border-border">
          {cart.items.map((l) => (
            <CartLine key={l.id} line={l} />
          ))}
        </ul>
      </section>

      <aside className="h-fit space-y-4 rounded-brand bg-muted p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatearCentavos(cart.subtotal_cents)}</dd>
          </div>
          {cart.discount_cents > 0 && (
            <div className="flex justify-between text-accent">
              <dt>Descuento</dt>
              <dd>-{formatearCentavos(cart.discount_cents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatearCentavos(cart.total_cents)}</dd>
          </div>
        </dl>
        {cart.free_shipping ? (
          <p className="text-sm text-accent">¡Tenés envío gratis!</p>
        ) : cart.free_amount ? (
          <p className="text-sm text-muted-fg">Te faltan {normalizarMonto(cart.free_amount)} para el envío gratis.</p>
        ) : null}
        <CouponForm code={cart.coupon_code} />
        <form action={finalizarCompra}>
          <SubmitButton className="btn w-full" pendingText="Yendo al checkout…">
            Finalizar compra
          </SubmitButton>
        </form>
        <p className="text-center text-xs text-muted-fg">El pago se hace en el checkout seguro de la marca.</p>
      </aside>
    </div>
  );
}

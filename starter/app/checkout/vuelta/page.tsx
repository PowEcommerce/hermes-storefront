// La vuelta del checkout hosteado. NUNCA confíes en la query: el estado real
// se lee server-side con el token PRIVADO (psk_), que nunca llega al navegador.
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CheckoutSession } from '@hermesecommerce/storefront';
import { hermes, tienePrivado } from '@/lib/hermes';
import { esNoEncontrado, mensajeDeError } from '@/lib/errors';
import { VaciarCarrito } from './VaciarCarrito';

export const metadata: Metadata = { title: 'Tu compra', robots: { index: false } };

type Resultado = 'exito' | 'pendiente' | 'fallido' | 'en_curso';

function resultadoDe(s: CheckoutSession): Resultado {
  if (s.status === 'expired') return 'fallido';
  if (s.status === 'open') return s.payment_status === 'failed' ? 'fallido' : 'en_curso';
  if (s.payment_status === 'paid') return 'exito';
  if (s.payment_status === 'pending' || s.payment_status === null) return 'pendiente';
  return 'fallido';
}

const TEXTOS: Record<Resultado, { titulo: string; texto: string }> = {
  exito: { titulo: '¡Gracias por tu compra!', texto: 'Recibimos tu pago. Te mandamos el detalle por mail.' },
  pendiente: {
    titulo: 'Tu pedido quedó registrado',
    texto: 'Estamos esperando la confirmación del pago. Te avisamos por mail cuando se acredite.',
  },
  fallido: { titulo: 'No se pudo completar el pago', texto: 'No se te cobró nada. Podés volver a intentarlo desde el carrito.' },
  en_curso: { titulo: 'Tu compra sigue abierta', texto: 'Todavía no terminaste el pago. Podés retomarlo desde el carrito.' },
};

export default async function VueltaDelCheckout({ searchParams }: PageProps<'/checkout/vuelta'>) {
  const { checkout_session_id: id } = await searchParams;
  if (typeof id !== 'string' || !id.startsWith('cs_'))
    return <Mensaje titulo="No encontramos tu compra" texto="Falta el identificador de la sesión de checkout." />;
  if (!tienePrivado)
    return (
      <Mensaje
        titulo="Falta configurar la tienda"
        texto="Para leer el estado del pago hace falta HERMES_PRIVATE_TOKEN (psk_) en el servidor: corré `hermes link`."
      />
    );

  let sesion: CheckoutSession;
  try {
    sesion = await hermes.checkoutSessions.get(id);
  } catch (e) {
    if (esNoEncontrado(e)) return <Mensaje titulo="No encontramos tu compra" texto="La sesión de checkout no existe." />;
    return <Mensaje titulo="No pudimos consultar tu compra" texto={mensajeDeError(e)} />;
  }

  const r = resultadoDe(sesion);
  const { titulo, texto } = TEXTOS[r];
  return (
    <Mensaje titulo={titulo} texto={texto} estado={r}>
      {sesion.order_id && <p className="text-sm text-muted-fg">Pedido #{sesion.order_id}</p>}
      {sesion.status === 'completed' && <VaciarCarrito />}
      <div className="mt-6 flex justify-center gap-3">
        {r === 'exito' || r === 'pendiente' ? (
          <>
            <Link href="/" className="btn">
              Seguir comprando
            </Link>
            <Link href="/cuenta" className="btn-outline">
              Mis pedidos
            </Link>
          </>
        ) : (
          <Link href="/carrito" className="btn">
            Volver al carrito
          </Link>
        )}
      </div>
    </Mensaje>
  );
}

function Mensaje({
  titulo,
  texto,
  estado,
  children,
}: {
  titulo: string;
  texto: string;
  estado?: Resultado;
  children?: React.ReactNode;
}) {
  const color = estado === 'exito' ? 'text-accent' : estado === 'fallido' ? 'text-danger' : '';
  return (
    <div className="mx-auto max-w-lg space-y-3 py-16 text-center" data-estado={estado}>
      <h1 className={`text-2xl font-semibold ${color}`}>{titulo}</h1>
      <p>{texto}</p>
      {children}
    </div>
  );
}

import Link from 'next/link';

// 404: una franja a sangre en la tinta de la marca, con el botón blanco del kit.
export default function NotFound() {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center bg-fg px-4 py-24 text-center text-bg">
      <h1 className="ui-t-h1">Lo sentimos</h1>
      <p className="ui-t-titulo mt-3 max-w-xl">No encontramos esta página. Puede que el producto o la categoría ya no estén disponibles.</p>
      <Link href="/" className="ui-boton ui-boton--blanco mt-8 w-full max-w-[340px]">
        Ir al inicio
      </Link>
    </div>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="mb-3 text-3xl font-semibold">No encontramos esta página</h1>
      <p className="mb-6 text-muted-fg">Puede que el producto o la categoría ya no estén disponibles.</p>
      <Link href="/" className="btn">
        Ir al inicio
      </Link>
    </div>
  );
}

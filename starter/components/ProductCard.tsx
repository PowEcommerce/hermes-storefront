import Link from 'next/link';
import type { ProductCardData } from '@/lib/catalog';

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  if (!products.length) return <p className="py-10 text-center text-muted-fg">No hay productos para mostrar.</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
      {products.map((p) => (
        <li key={p.key}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

export function ProductCard({ product: p }: { product: ProductCardData }) {
  return (
    <Link href={`/producto/${p.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-brand bg-muted">
        {p.image && (
          <img src={p.image} alt={p.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {p.imageHover && (
          <img
            src={p.imageHover}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p className="line-clamp-2">{p.title}</p>
        <p>
          <span className="font-medium">{p.price}</span>
          {p.compareAt && <span className="ml-2 text-muted-fg line-through">{p.compareAt}</span>}
        </p>
        {p.colors.length > 1 && (
          <p className="flex gap-1" aria-label={`Colores: ${p.colors.map((c) => c.name).join(', ')}`}>
            {p.colors.map((c) => (
              <span key={c.hex + c.name} className="h-3 w-3 rounded-full border border-border" style={{ background: c.hex }} />
            ))}
          </p>
        )}
      </div>
    </Link>
  );
}

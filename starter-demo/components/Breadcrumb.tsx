import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

/**
 * Migas 12/400: chevron para volver (objetivo táctil de 44) y
 * «Padre | Actual», con lo actual en gris secundario.
 */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  if (!items.length) return null;
  const volver = [...items].reverse().find((i) => i.href)?.href ?? '/';
  return (
    <nav aria-label="Ubicación" className="flex min-h-6 items-center text-xs">
      <Link href={volver} aria-label="Volver" className="-my-2.5 -ml-3.5 inline-flex h-11 w-11 items-center justify-center">
        <ChevronLeft size={16} strokeWidth={1.5} />
      </Link>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => {
          const ultimo = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-fg">|</span>}
              {it.href && !ultimo ? (
                <Link href={it.href} className="hover:underline hover:underline-offset-2">
                  {it.label}
                </Link>
              ) : (
                <span className={ultimo && items.length > 1 ? 'text-muted-fg' : undefined} aria-current={ultimo ? 'page' : undefined}>
                  {it.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

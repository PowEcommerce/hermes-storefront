import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

type SP = Record<string, string | string[] | undefined>;

function hrefDe(base: string, sp: SP, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Paginación con links (la página va en la URL: se puede compartir y cachear). */
export function Pagination({ base, searchParams, page, pages }: { base: string; searchParams: SP; page: number; pages: number }) {
  if (pages <= 1) return null;
  const clase = 'ui-boton ui-boton--secundario ui-boton--chico';
  return (
    <nav aria-label="Páginas" className="mt-14 flex items-center justify-center gap-6">
      {page > 1 ? (
        <Link className={clase} href={hrefDe(base, searchParams, page - 1)} rel="prev">
          <ArrowLeft size={18} strokeWidth={1.5} /> Anterior
        </Link>
      ) : (
        <span className={clase} aria-disabled="true">
          <ArrowLeft size={18} strokeWidth={1.5} /> Anterior
        </span>
      )}
      <span className="ui-t-cuerpo text-muted-fg">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link className={clase} href={hrefDe(base, searchParams, page + 1)} rel="next">
          Siguiente <ArrowRight size={18} strokeWidth={1.5} />
        </Link>
      ) : (
        <span className={clase} aria-disabled="true">
          Siguiente <ArrowRight size={18} strokeWidth={1.5} />
        </span>
      )}
    </nav>
  );
}

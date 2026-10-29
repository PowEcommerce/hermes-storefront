import Link from 'next/link';

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

export function Pagination({ base, searchParams, page, pages }: { base: string; searchParams: SP; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Páginas" className="mt-10 flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link className="btn-outline h-9" href={hrefDe(base, searchParams, page - 1)} rel="prev">
          Anterior
        </Link>
      ) : (
        <span className="btn-outline h-9 opacity-40">Anterior</span>
      )}
      <span>
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link className="btn-outline h-9" href={hrefDe(base, searchParams, page + 1)} rel="next">
          Siguiente
        </Link>
      ) : (
        <span className="btn-outline h-9 opacity-40">Siguiente</span>
      )}
    </nav>
  );
}

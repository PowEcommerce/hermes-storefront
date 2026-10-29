import Link from 'next/link';
import { ORDENES, elegidos, type Faceta } from '@/lib/catalog';

type SP = Record<string, string | string[] | undefined>;

/**
 * Filtros de la PLP como un <form method="get">: sin JavaScript, la URL es la
 * fuente de verdad (se puede compartir y cachear). Las facetas son las de
 * `catalog.filters` de la categoría.
 */
export function Filters({ base, facetas, searchParams }: { base: string; facetas: Faceta[]; searchParams: SP }) {
  const orden = typeof searchParams.orden === 'string' ? searchParams.orden : 'destacados';
  const hayFiltros = facetas.some((f) => elegidos(searchParams, f.key).length > 0);
  return (
    <form action={base} className="space-y-6 text-sm">
      <div>
        <label htmlFor="orden" className="mb-2 block font-medium">
          Ordenar por
        </label>
        <select id="orden" name="orden" defaultValue={orden} className="input h-10">
          {Object.entries(ORDENES).map(([k, o]) => (
            <option key={k} value={k}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {facetas.map((f) => {
        const activos = new Set(elegidos(searchParams, f.key));
        return (
          <fieldset key={f.key}>
            <legend className="mb-2 font-medium">{f.label}</legend>
            <div className="flex flex-wrap gap-2">
              {f.options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-brand border border-border px-3 py-1.5 has-[:checked]:border-fg has-[:checked]:bg-muted"
                >
                  <input type="checkbox" name={f.key} value={o.value} defaultChecked={activos.has(o.value)} className="sr-only" />
                  {o.hex && <span className="h-3 w-3 rounded-full border border-border" style={{ background: o.hex }} />}
                  <span>{o.value}</span>
                  {o.total > 0 && <span className="text-muted-fg">({o.total})</span>}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <div className="flex gap-3">
        <button type="submit" className="btn h-10 flex-1">
          Aplicar
        </button>
        {hayFiltros && (
          <Link href={base} className="btn-outline h-10">
            Limpiar
          </Link>
        )}
      </div>
    </form>
  );
}

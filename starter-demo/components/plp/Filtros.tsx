import Link from 'next/link';
import { elegidos, type Faceta } from '@/lib/catalog';
import styles from './Plp.module.css';

type SP = Record<string, string | string[] | undefined>;

/**
 * Filtros de la PLP como un <form method="get">: sin JavaScript, la URL es la
 * fuente de verdad (se puede compartir y cachear). Las facetas son las de
 * `catalog.filters` de la categoría; cada una es un acordeón con sus opciones
 * como casillas (con el color, si lo tiene). El orden elegido viaja oculto.
 */
export function Filtros({ base, facetas, searchParams }: { base: string; facetas: Faceta[]; searchParams: SP }) {
  const orden = typeof searchParams.orden === 'string' ? searchParams.orden : null;
  const hayFiltros = facetas.some((f) => elegidos(searchParams, f.key).length > 0);
  return (
    <form action={base} className={styles.filtros}>
      {orden && <input type="hidden" name="orden" value={orden} />}
      <div className={styles.facetas}>
        {facetas.length === 0 && <p className={styles.sinFacetas}>Esta categoría no tiene filtros.</p>}
        {facetas.map((f) => {
          const activos = new Set(elegidos(searchParams, f.key));
          return (
            <details key={f.key} className={styles.faceta} open={activos.size > 0 || facetas.length <= 3}>
              <summary className={styles.facetaTitulo}>
                {f.label}
                {activos.size > 0 && <span className={styles.facetaCantidad}>{activos.size}</span>}
              </summary>
              <div className={styles.opciones}>
                {f.options.map((o) => (
                  <label key={o.value} className={styles.opcion}>
                    <input type="checkbox" name={f.key} value={o.value} defaultChecked={activos.has(o.value)} className={styles.casilla} />
                    {o.hex && <span className={styles.opcionColor} style={{ background: o.hex }} />}
                    <span>{o.value}</span>
                    {o.total > 0 && <span className={styles.opcionTotal}>({o.total})</span>}
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <div className={styles.filtrosPie}>
        {hayFiltros && (
          <Link href={orden ? `${base}?orden=${encodeURIComponent(orden)}` : base} className="ui-boton ui-boton--secundario">
            Limpiar
          </Link>
        )}
        <button type="submit" className={`ui-boton ${styles.aplicar}`}>
          Ver resultados
        </button>
      </div>
    </form>
  );
}

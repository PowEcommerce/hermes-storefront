import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { ORDENES, elegidos, type Faceta, type Orden } from '@/lib/catalog';
import { PanelDeFiltros } from './PanelDeFiltros';
import styles from './Plp.module.css';

type SP = Record<string, string | string[] | undefined>;

/** La URL de la PLP con un cambio (sin `page`: cualquier cambio vuelve a la primera). */
function hrefCon(base: string, sp: SP, cambio: (q: URLSearchParams) => void) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  cambio(q);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Barra de la PLP, pegada debajo del header: «Filtrar» (abre el panel), las
 * píldoras de los filtros aplicados (cada una los quita), la cantidad y
 * «Ordenar» (un <details> con links: anda sin JavaScript).
 */
export function Toolbar({
  base,
  searchParams,
  facetas,
  total,
  children,
}: {
  base: string;
  searchParams: SP;
  facetas: Faceta[];
  total: number;
  /** El form de filtros (va adentro del panel). */
  children: ReactNode;
}) {
  const orden: Orden = typeof searchParams.orden === 'string' && searchParams.orden in ORDENES ? (searchParams.orden as Orden) : 'destacados';
  const aplicados = facetas.flatMap((f) => elegidos(searchParams, f.key).map((v) => ({ key: f.key, valor: v })));

  return (
    <section className={styles.toolbar}>
      <div className={styles.franja}>
        <div className={styles.izquierda}>
          <Suspense fallback={null}>
            <PanelDeFiltros activos={aplicados.length}>{children}</PanelDeFiltros>
          </Suspense>
        </div>
        <div className={styles.derecha}>
          <span className={styles.contador}>
            {total} {total === 1 ? 'producto' : 'productos'}
          </span>
          <details className={styles.ordenar}>
            <summary className={styles.chip}>
              Ordenar <ChevronDown size={16} strokeWidth={1.5} />
            </summary>
            <ul className={styles.dropdown}>
              {Object.entries(ORDENES).map(([k, o]) => (
                <li key={k}>
                  <Link
                    href={hrefCon(base, searchParams, (q) => (k === 'destacados' ? q.delete('orden') : q.set('orden', k)))}
                    className={`${styles.opcionOrden} ${k === orden ? styles.opcionOrdenActiva : ''}`}
                    aria-current={k === orden ? 'true' : undefined}
                  >
                    <span className={styles.radio} aria-hidden="true" />
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      {aplicados.length > 0 && (
        <ul className={styles.tags}>
          {aplicados.map((t) => (
            <li key={`${t.key}=${t.valor}`}>
              <Link
                href={hrefCon(base, searchParams, (q) => {
                  const resto = q.getAll(t.key).flatMap((v) => v.split(',')).filter((v) => v.trim() && v.trim() !== t.valor);
                  q.delete(t.key);
                  for (const v of resto) q.append(t.key, v);
                })}
                className={styles.tag}
                aria-label={`Quitar ${t.valor}`}
              >
                {t.valor} <X size={14} strokeWidth={1.5} />
              </Link>
            </li>
          ))}
          <li>
            <Link href={hrefCon(base, searchParams, (q) => facetas.forEach((f) => q.delete(f.key)))} className="ui-enlace ui-t-chico">
              Borrar todo
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}

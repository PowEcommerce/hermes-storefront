'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { trackSearchClick } from '@hermesecommerce/storefront/search';
import { hrefDeBusqueda, partesResaltadas, type PanelVacio } from '@/lib/buscador';
import { useMedirPanel, useSugerencias } from '@/lib/buscador-cliente';

/**
 * Campo de búsqueda del header con el panel del buscador inteligente. Sólo se
 * monta con la app `buscador-inteligente` prendida (ver Header.tsx).
 *
 *  - Antes de tipear: «Lo más buscado» y las categorías destacadas del backoffice.
 *  - Tipeando: términos con lo tipeado resaltado, categorías y hasta 5 productos.
 *  - Enter: si una regla del backoffice redirige el término, va ahí; si no, a /buscar.
 *
 * Es un <form> GET a /buscar: sin JavaScript sigue andando.
 */
export function BuscadorInteligente({ panel }: { panel: PanelVacio }) {
  const router = useRouter();
  const caja = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const { datos, de } = useSugerencias(q, panel.minCaracteres);
  useMedirPanel(datos, de);

  // Se cierra con Escape o con un clic afuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const tipeando = q.trim().length >= panel.minCaracteres;
  const vacioSinNada = !panel.masBuscado.length && !panel.destacadas.items.length;
  const cerrar = () => setAbierto(false);

  return (
    <div ref={caja} className="relative">
      <form
        action="/buscar"
        role="search"
        onSubmit={(e) => {
          const termino = q.trim();
          if (!termino) return;
          e.preventDefault();
          cerrar();
          // Una regla de redirección del backoffice manda (p. ej. «gift card» → su landing).
          const destino = de === termino && datos?.redirect ? datos.redirect : hrefDeBusqueda(termino);
          if (/^https?:\/\//.test(destino)) window.location.assign(destino);
          else router.push(destino);
        }}
      >
        <input
          name="q"
          type="search"
          placeholder="Buscar"
          aria-label="Buscar"
          autoComplete="off"
          maxLength={100}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={abierto}
          aria-controls="panel-del-buscador"
          className="input h-9 w-36 md:w-56"
        />
      </form>

      {abierto && (tipeando || !vacioSinNada) && (
        <div
          id="panel-del-buscador"
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,26rem)] space-y-5 rounded-brand border border-border bg-bg p-4 text-sm shadow-lg"
        >
          {!tipeando ? (
            <>
              {panel.masBuscado.length > 0 && (
                <section>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-fg">Lo más buscado</p>
                  <ul className="flex flex-wrap gap-2">
                    {panel.masBuscado.map((t) => (
                      <li key={t}>
                        <Link href={hrefDeBusqueda(t)} onClick={cerrar} className="btn-outline h-8 px-3 text-xs">
                          {t}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {panel.destacadas.items.length > 0 && (
                <section>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-fg">
                    {panel.destacadas.titulo || 'Categorías destacadas'}
                  </p>
                  <ul className="space-y-1">
                    {panel.destacadas.items.map((c) => (
                      <li key={c.href}>
                        <Link href={c.href} onClick={cerrar} className="hover:underline">
                          {c.nombre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : !datos ? (
            <p className="text-muted-fg">Buscando…</p>
          ) : (
            <>
              {datos.corrected_query && (
                <p className="text-muted-fg">Mostrando resultados para “{datos.corrected_query}”</p>
              )}
              {datos.terms.length + datos.categories.length > 0 && (
                <ul className="space-y-1">
                  {datos.terms.map((t) => (
                    <li key={`t-${t.term}`}>
                      <Link href={hrefDeBusqueda(t.term)} onClick={cerrar} className="block hover:underline">
                        <Resaltado termino={t.term} highlight={t.highlight} />
                      </Link>
                    </li>
                  ))}
                  {datos.categories.map((c) => (
                    <li key={`c-${c.href}`}>
                      <Link href={c.href} onClick={cerrar} className="block hover:underline">
                        <Resaltado termino={c.term} highlight={c.highlight} />
                        <span className="ml-2 text-xs text-muted-fg">Categoría</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {datos.products.length > 0 ? (
                <ul className="space-y-3">
                  {datos.products.map((p) => (
                    <li key={p.key}>
                      <Link
                        href={`/producto/${p.slug}`}
                        className="flex items-center gap-3 hover:underline"
                        onClick={() => {
                          if (p.pg_id && datos.attribution_token)
                            trackSearchClick({
                              key: p.slug,
                              pg_id: p.pg_id,
                              position: p.position,
                              attribution_token: datos.attribution_token,
                              origin: 'panel',
                              term: de,
                            });
                          cerrar();
                        }}
                      >
                        <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-brand bg-muted">
                          {p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 block">{p.title}</span>
                          {p.price && <span className="font-medium">{p.price}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                datos.terms.length + datos.categories.length === 0 && (
                  <p className="text-muted-fg">No encontramos resultados para “{de}”.</p>
                )
              )}
              {datos.total > 0 && (
                <Link href={hrefDeBusqueda(de)} onClick={cerrar} className="btn w-full">
                  Ver {datos.total === 1 ? 'el producto' : `los ${datos.total} productos`}
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Resaltado({ termino, highlight }: { termino: string; highlight: number[] | null }) {
  return (
    <>
      {partesResaltadas(termino, highlight).map((p, i) =>
        p.marcado ? (
          <strong key={i} className="font-semibold">
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

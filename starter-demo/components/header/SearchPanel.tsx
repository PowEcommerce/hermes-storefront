'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { trackSearchClick } from '@hermesecommerce/storefront/search';
import { useBloquearScroll, useCerrarConEscape } from '@/lib/hooks';
import { hrefDeBusqueda, partesResaltadas, type PanelVacio } from '@/lib/buscador';
import { useMedirPanel, useSugerencias } from '@/lib/buscador-cliente';
import type { CategoriaDelMenu } from './HeaderBar';
import styles from './SearchPanel.module.css';

/**
 * Buscador: panel que baja desde arriba con el campo (un <form> GET a
 * /buscar, así anda también sin JavaScript).
 *
 *  - Sin la app `buscador-inteligente` (`buscador` null): atajos a las categorías.
 *  - Con la app prendida: antes de tipear, «Lo más buscado» y las categorías
 *    destacadas del backoffice; tipeando, términos (lo tipeado resaltado),
 *    categorías y hasta 5 productos. Enter respeta las redirecciones del backoffice.
 */
export function SearchPanel({
  abierto,
  categorias,
  buscador = null,
  onClose,
}: {
  abierto: boolean;
  categorias: CategoriaDelMenu[];
  buscador?: PanelVacio | null;
  onClose: () => void;
}) {
  useBloquearScroll(abierto);
  useCerrarConEscape(abierto, onClose);
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const minimo = buscador?.minCaracteres ?? Infinity;
  const { datos, de } = useSugerencias(buscador ? q : '', minimo);
  useMedirPanel(datos, de);
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);
  const tab = abierto ? 0 : -1;
  const tipeando = !!buscador && q.trim().length >= minimo;

  return (
    <>
      <div className={`${styles.velo} ${abierto ? styles.visible : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.panel} ${abierto ? styles.visible : ''}`} role="dialog" aria-label="Buscar" aria-hidden={!abierto}>
        <form
          action="/buscar"
          role="search"
          className={styles.form}
          onSubmit={(e) => {
            onClose();
            const termino = q.trim();
            if (!buscador || !termino) return;
            // Una regla de redirección del backoffice manda (p. ej. «gift card» → su landing).
            e.preventDefault();
            const destino = de === termino && datos?.redirect ? datos.redirect : hrefDeBusqueda(termino);
            if (/^https?:\/\//.test(destino)) window.location.assign(destino);
            else router.push(destino);
          }}
        >
          <Search size={24} strokeWidth={1.5} aria-hidden="true" className={styles.lupa} />
          <label htmlFor="buscador" className="ui-solo-lectores">
            Buscar productos
          </label>
          <input
            ref={campo}
            id="buscador"
            name="q"
            type="search"
            placeholder="¿Qué estás buscando?"
            autoComplete="off"
            maxLength={100}
            className={styles.input}
            tabIndex={tab}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className={styles.cerrar} onClick={onClose} aria-label="Cerrar buscador" tabIndex={tab}>
            <X size={22} strokeWidth={1.5} />
          </button>
        </form>

        {!buscador ? (
          <Chips titulo="Categorías" items={categorias.map((c) => ({ href: `/categoria/${c.slug}`, texto: c.name }))} onClose={onClose} tab={tab} />
        ) : !tipeando ? (
          <>
            <Chips
              titulo="Lo más buscado"
              items={buscador.masBuscado.map((t) => ({ href: hrefDeBusqueda(t), texto: t }))}
              onClose={onClose}
              tab={tab}
            />
            <Chips
              titulo={buscador.destacadas.titulo || 'Categorías destacadas'}
              items={buscador.destacadas.items.map((c) => ({ href: c.href, texto: c.nombre }))}
              onClose={onClose}
              tab={tab}
            />
          </>
        ) : datos ? (
          <div className={styles.atajos} aria-live="polite">
            {datos.corrected_query && <p className={styles.rotulo}>Mostrando resultados para “{datos.corrected_query}”</p>}
            {datos.terms.length + datos.categories.length > 0 && (
              <ul className={styles.sugerencias}>
                {datos.terms.map((t) => (
                  <li key={`t-${t.term}`}>
                    <Link href={hrefDeBusqueda(t.term)} onClick={onClose} tabIndex={tab} className={styles.sugerencia}>
                      <Resaltado termino={t.term} highlight={t.highlight} />
                    </Link>
                  </li>
                ))}
                {datos.categories.map((c) => (
                  <li key={`c-${c.href}`}>
                    <Link href={c.href} onClick={onClose} tabIndex={tab} className={styles.sugerencia}>
                      <Resaltado termino={c.term} highlight={c.highlight} /> <span className={styles.tipo}>Categoría</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {datos.products.length > 0 ? (
              <ul className={styles.productos}>
                {datos.products.map((p) => (
                  <li key={p.key}>
                    <Link
                      href={`/producto/${p.slug}`}
                      tabIndex={tab}
                      className={styles.producto}
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
                        onClose();
                      }}
                    >
                      <span className={styles.foto}>{p.image && <img src={p.image} alt="" loading="lazy" />}</span>
                      <span className={styles.nombre}>{p.title}</span>
                      {p.price && <span className={styles.precio}>{p.price}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              datos.terms.length + datos.categories.length === 0 && (
                <p className={styles.rotulo}>No encontramos resultados para “{de}”.</p>
              )
            )}
            {datos.total > 0 && (
              <Link href={hrefDeBusqueda(de)} onClick={onClose} tabIndex={tab} className={styles.chip}>
                Ver {datos.total === 1 ? 'el producto' : `los ${datos.total} productos`}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Chips({
  titulo,
  items,
  onClose,
  tab,
}: {
  titulo: string;
  items: { href: string; texto: string }[];
  onClose: () => void;
  tab: number;
}) {
  if (!items.length) return null;
  return (
    <div className={styles.atajos}>
      <p className={styles.rotulo}>{titulo}</p>
      <ul className={styles.chips}>
        {items.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className={styles.chip} onClick={onClose} tabIndex={tab}>
              {c.texto}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resaltado({ termino, highlight }: { termino: string; highlight: number[] | null }) {
  return (
    <>
      {partesResaltadas(termino, highlight).map((p, i) =>
        p.marcado ? <strong key={i}>{p.texto}</strong> : <span key={i}>{p.texto}</span>,
      )}
    </>
  );
}

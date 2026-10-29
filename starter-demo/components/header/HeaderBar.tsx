'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Menu, Search, ShoppingBag, User } from 'lucide-react';
import { CartBadge } from '@/components/CartBadge';
import { MegaMenu } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { SearchPanel } from './SearchPanel';
import styles from './Header.module.css';

export interface CategoriaDelMenu {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  children: { id: number; name: string; slug: string }[];
}

export interface MarcaDelHeader {
  name: string;
  logo: string | null;
}

/**
 * Barra fija de 80 (64 en mobile). Si la página empieza con un hero (un
 * elemento `[data-hero]`, lo marca components/blocks/PageBlocks.tsx en la
 * primera sección de imagen de la home), el header va TRANSPARENTE encima de
 * la foto, con el logo y los íconos en blanco (o en negro si la marca eligió
 * `text_color: dark` en el backoffice). Se vuelve blanco al pasar el mouse,
 * al scrollear más allá del hero o con un panel abierto. Eso lo decide el CSS
 * (`body:has([data-hero])`), así no hay salto al hidratar.
 */
export function HeaderBar({
  marca,
  categorias,
  tono,
}: {
  marca: MarcaDelHeader;
  categorias: CategoriaDelMenu[];
  tono: 'light' | 'dark';
}) {
  const pathname = usePathname();
  const [pasoElHero, setPasoElHero] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mobileAbierto, setMobileAbierto] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

  // ¿Ya se scrolleó más allá del hero? Se mide el hero real ([data-hero]),
  // no una altura fija: el primer bloque lo decide el backoffice.
  useEffect(() => {
    const mirar = () => {
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      if (!hero) return setPasoElHero(true);
      setPasoElHero(window.scrollY > hero.offsetTop + hero.offsetHeight - 80);
    };
    const frame = requestAnimationFrame(mirar);
    window.addEventListener('scroll', mirar, { passive: true });
    window.addEventListener('resize', mirar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', mirar);
      window.removeEventListener('resize', mirar);
    };
  }, [pathname]);

  // Al navegar se cierra todo (ajuste de estado al cambiar una prop, sin efecto).
  const [ruta, setRuta] = useState(pathname);
  if (ruta !== pathname) {
    setRuta(pathname);
    setMenuAbierto(false);
    setMobileAbierto(false);
    setBuscadorAbierto(false);
  }

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  const solido = pasoElHero || menuAbierto || buscadorAbierto;

  return (
    <>
      <div className={`${styles.contenedor} ${solido ? styles.solido : ''}`} data-tono={tono}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label={`${marca.name} — inicio`}>
            {marca.logo ? (
              <img src={marca.logo} alt={marca.name} className={styles.logoImagen} />
            ) : (
              <span className={styles.logoTexto}>{marca.name}</span>
            )}
          </Link>

          <nav className={styles.iconos} aria-label="Cuenta, búsqueda, carrito y menú">
            <Link href="/cuenta" className={styles.icono} aria-label="Mi cuenta" title="Mi cuenta">
              <User size={24} strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              className={styles.icono}
              onClick={() => {
                setMenuAbierto(false);
                setBuscadorAbierto(true);
              }}
              aria-label="Buscar"
              title="Buscar"
            >
              <Search size={24} strokeWidth={1.5} />
            </button>
            <Link href="/carrito" className={styles.icono} aria-label="Carrito" title="Carrito">
              <ShoppingBag size={24} strokeWidth={1.5} />
              <CartBadge className={styles.badge} />
            </Link>
            {categorias.length > 0 && (
              <button
                type="button"
                className={`${styles.icono} ${styles.soloDesktop}`}
                onClick={() => setMenuAbierto(true)}
                onMouseEnter={() => setMenuAbierto(true)}
                aria-label="Menú"
                title="Menú"
                aria-expanded={menuAbierto}
              >
                <Menu size={24} strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.icono} ${styles.soloMobile}`}
              onClick={() => setMobileAbierto(true)}
              aria-label="Menú"
              title="Menú"
              aria-expanded={mobileAbierto}
            >
              <Menu size={24} strokeWidth={1.5} />
            </button>
          </nav>
        </header>

        <MegaMenu abierto={menuAbierto} categorias={categorias} onClose={cerrarMenu} />
      </div>

      {/* El contenido empieza debajo del header; un hero sube y queda abajo de la barra transparente. */}
      <div className={styles.espaciador} aria-hidden="true" />

      <MobileNav abierto={mobileAbierto} marca={marca} categorias={categorias} onClose={() => setMobileAbierto(false)} />
      <SearchPanel abierto={buscadorAbierto} categorias={categorias} onClose={() => setBuscadorAbierto(false)} />
    </>
  );
}

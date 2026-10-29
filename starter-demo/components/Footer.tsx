// Footer (Server Component), fondo en la tinta de la marca:
//
//   marquee con el nombre de la marca, que corre solo
//   links grandes: las categorías raíz y las páginas estáticas del backoffice
//   el nombre de la marca a lo ancho (o su logo, si lo tiene)
//   legales: © año, las estáticas y "Hecho con Hermes"
import Link from 'next/link';
import { Asterisk } from 'lucide-react';
import type { Brand } from '@/lib/brand';
import { hermes } from '@/lib/hermes';
import { rutaDeEstatica } from '@/lib/estaticas';
import styles from './Footer.module.css';

/** Copias del marquee: suficientes para cubrir pantallas anchas (la pista se duplica para el loop). */
const COPIAS = 8;

async function datos() {
  const [cats, estaticas] = await Promise.all([
    hermes.catalog.categories().catch(() => null),
    hermes.content.staticContents().catch(() => null),
  ]);
  return {
    categorias: (cats?.categories ?? []).filter((c) => c.slug && c.name).slice(0, 6),
    estaticas: (estaticas?.static_contents ?? []).filter((e) => e.path && e.title).slice(0, 8),
  };
}

export async function Footer({ brand }: { brand: Brand }) {
  const { categorias, estaticas } = await datos();
  const anio = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.marquee} aria-hidden="true">
        <div className={styles.pista}>
          {Array.from({ length: COPIAS * 2 }).map((_, i) => (
            <span key={i} className={styles.item}>
              <span className={styles.itemTexto}>{brand.name}</span>
              <Asterisk className={styles.estrella} size={28} strokeWidth={1.75} />
            </span>
          ))}
        </div>
      </div>

      {categorias.length > 0 && (
        <nav className={styles.links} aria-label="Categorías">
          {categorias.map((c) => (
            <Link key={c.id} href={`/categoria/${c.slug}`} className={styles.link}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className={styles.marca} aria-hidden="true">
        {brand.logo ? <img src={brand.logo} alt="" className={styles.logo} loading="lazy" /> : <span className={styles.wordmark}>{brand.name}</span>}
      </div>

      <div className={styles.abajo}>
        {estaticas.length > 0 && (
          <nav className={styles.legales} aria-label="Información">
            {estaticas.map((e) => (
              <Link key={e.path} href={rutaDeEstatica(e.path!)} className={styles.legal}>
                {e.title}
              </Link>
            ))}
          </nav>
        )}
        <p className={styles.copyright}>
          © {anio} {brand.name} · Hecho con{' '}
          <a href="https://github.com/PowEcommerce/hermes-storefront" target="_blank" rel="noopener noreferrer" className={styles.legal}>
            Hermes
          </a>
        </p>
      </div>
    </footer>
  );
}

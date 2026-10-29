// PDP: fotos, precio, color (links ?color=<option_id>, server-side), talle con
// stock y "Agregar al carrito" (client component + Server Action). Reseñas si
// la marca tiene la app prendida (settings/integrations).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { esNoEncontrado } from '@/lib/errors';
import { AddToCart, type Talle as TalleUI } from '@/components/AddToCart';
import { precioDe, precioSinTalle, precioVisible, type Precio } from '@/lib/precios';
import { cardFromRelacionado, cucardasDe, type ProductCardData } from '@/lib/catalog';
import { Reviews } from '@/components/Reviews';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ProductCard } from '@/components/ProductCard';
import { FilaDeProductos } from '@/components/blocks/FilaDeProductos';
import { Galeria } from '@/components/producto/Galeria';
import { solapasDe } from '@/lib/solapas';
import styles from '@/components/producto/Producto.module.css';

async function producto(slug: string) {
  try {
    return await hermes.catalog.product(slug);
  } catch (e) {
    if (esNoEncontrado(e)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<'/producto/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  // Sin notFound() acá: el 404 lo resuelve la página (así se renderiza app/not-found en el server).
  const p = await hermes.catalog.product(slug).catch(() => null);
  if (!p) return { title: slug };
  return {
    title: p.meta_title || p.title || slug,
    description: p.meta_description ?? p.brief_description ?? undefined,
    openGraph: p.pictures?.[0] ? { images: [p.pictures[0]] } : undefined,
  };
}

const numero = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** Un talle con su precio numérico (en el server; al client va formateado). */
type Talle = Omit<TalleUI, 'precio'> & { precio: Precio | null };

const precioVisibleDe = (p: Precio | null) => (p ? precioVisible(p) : null);

export default async function ProductoPage({ params, searchParams }: PageProps<'/producto/[slug]'>) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await producto(slug);
  const id = p.id ?? slug;

  // Color: la propiedad principal. El elegido viene en ?color=<option_id>.
  const colores = p.main_property?.type === 'Color' ? p.main_property.available_options : [];
  const pedido = Number(sp.color);
  const colorId = colores.some((c) => c.id === pedido) ? pedido : (p.main_property?.option_id ?? null);

  // Con color: change_variant trae fotos, precio y los talles (con su variante y stock) de ese color.
  const delColor =
    colorId && colores.length ? await hermes.catalog.changeVariant(id, [colorId]).catch(() => null) : null;

  // Cada talle con SU precio: la oferta puede ser de una sola variante (la S
  // en oferta y M/L/XL a precio de lista), así que el precio de nivel
  // superior de change_variant (= la primera variante del color) no sirve
  // para todo el color. update_variant(color + talle) da el de cada una: van
  // en paralelo y cacheadas con los tags del adaptador (product-<slug>…).
  let talles: Talle[];
  if (delColor?.size_variants?.length) {
    const fallback = precioDe(delColor);
    talles = await Promise.all(
      delColor.size_variants.map(async (t): Promise<Talle> => {
        const v =
          colorId && t.option_id
            ? await hermes.catalog.updateVariant(id, [colorId, t.option_id]).catch(() => null)
            : null;
        const precio = v?.validVariant && v.variant_id === t.variant_id ? precioDe(v) : null;
        return { variantId: t.variant_id, label: t.description, stock: t.stock, precio: precio ?? fallback };
      }),
    );
  } else {
    // Sin color: el talle (si hay) se resuelve con update_variant opción por opción.
    const choice = p.choices?.find((c) => c.available_options.length > 1 && c.property_id !== p.main_property?.id);
    if (choice) {
      const resueltos = await Promise.all(
        choice.available_options.map(async (o): Promise<Talle | null> => {
          const v = await hermes.catalog.updateVariant(id, [o.id]).catch(() => null);
          return v?.validVariant
            ? { variantId: v.variant_id, label: o.description ?? '', stock: numero(v.stock), precio: precioDe(v) }
            : null;
        }),
      );
      talles = resueltos.filter((t): t is Talle => t !== null);
    } else {
      talles = p.variant
        ? [{ variantId: p.variant.id, label: null, stock: numero(p.variant.stock), precio: precioDe(p.variant) }]
        : [];
    }
  }

  // Precios ya formateados en el server (el client sólo elige cuál mostrar).
  const tallesConPrecio: TalleUI[] = talles.map((t) => ({ ...t, precio: t.precio ? precioVisible(t.precio) : null }));
  const precioInicial = precioSinTalle(talles) ?? precioVisibleDe(precioDe(delColor ?? p.variant));
  const fotos = (delColor?.pictures?.length ? delColor.pictures : p.pictures) ?? [];
  const sinStock = p.disable_submit === true || talles.every((t) => t.stock <= 0);
  // HTML del backoffice: sanitizado en el server (lib/solapas.ts → lib/sanitize.ts).
  const solapas = solapasDe(p.solapas);

  // Cucardas de texto: el % OFF de la oferta y las del backoffice.
  const base = precioDe(delColor ?? p.variant);
  const off = base && base.lista && base.lista > base.actual ? Math.round((1 - base.actual / base.lista) * 100) : 0;
  const cucardas = [...(off > 0 ? [`${off}% OFF`] : []), ...cucardasDe(p as unknown as Record<string, unknown>)];
  const categoria = p.categories?.[0];
  const titulo = p.title ?? slug;

  return (
    <div>
      <div className={styles.ficha}>
        <div className={styles.galeriaCelda}>
          <Galeria fotos={fotos} alt={titulo} />
        </div>

        <div className={styles.columna}>
          <div className={styles.migas}>
            <Breadcrumb
              items={[
                { label: 'Inicio', href: '/' },
                ...(categoria?.slug ? [{ label: categoria.name ?? categoria.slug, href: `/categoria/${categoria.slug}` }] : []),
                { label: titulo },
              ]}
            />
          </div>
          <div className={styles.compraCelda}>
            <AddToCart
              key={colorId ?? 'unico'}
              titulo={titulo}
              cucardas={cucardas}
              talles={tallesConPrecio}
              sinStock={sinStock}
              precioSinTalle={precioInicial}
            >
              {colores.length > 1 && (
                <div className={styles.grupo}>
                  <p className={styles.etiqueta}>
                    Color <span className={styles.etiquetaValor}>{colores.find((c) => c.id === colorId)?.description}</span>
                  </p>
                  <ul className={styles.colores}>
                    {colores.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/producto/${slug}?color=${c.id}`}
                          scroll={false}
                          aria-label={c.description ?? ''}
                          aria-current={c.id === colorId ? 'true' : undefined}
                          title={c.description ?? ''}
                          className={`${styles.color} ${c.id === colorId ? styles.colorActivo : ''} ${c.stock <= 0 ? styles.colorAgotado : ''}`}
                          style={{ background: c.hexa ?? undefined }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </AddToCart>

            {p.description && <p className={styles.descripcion}>{p.description}</p>}

            {solapas.length > 0 && (
              <div className={styles.solapas}>
                {solapas.map((s) => (
                  <details key={s.position} className={styles.solapa}>
                    <summary className={styles.solapaTitulo}>{s.title}</summary>
                    {/* HTML que carga la marca en su backoffice, ya sanitizado (solapasDe) */}
                    <div className={`prose-html ${styles.solapaCuerpo}`} dangerouslySetInnerHTML={{ __html: s.html }} />
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Relacionados id={id} />

      <div className={styles.resenas}>
        <Reviews slug={slug} />
      </div>
    </div>
  );
}

/** «También te puede gustar»: `catalog.related` (cacheado por tags). Sin relacionados, no se dibuja. */
async function Relacionados({ id }: { id: string | number }) {
  const r = await hermes.catalog.related(id).catch(() => null);
  const cards = (r?.related_variants ?? []).map(cardFromRelacionado).filter((c): c is ProductCardData => c !== null).slice(0, 12);
  if (!cards.length) return null;
  return (
    <section className={styles.relacionados} aria-label="También te puede gustar">
      <FilaDeProductos titulo={<h2 className="ui-t-h2">También te puede gustar</h2>}>
        {cards.map((c) => (
          <li key={c.key} className={styles.relacionadoItem}>
            <ProductCard product={c} variante="chica" />
          </li>
        ))}
      </FilaDeProductos>
    </section>
  );
}

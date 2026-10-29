// Header de la tienda (Server Component): pide las categorías del menú
// (`catalog.categories`, cacheadas con el tag `categories`) y le pasa al
// client component sólo lo que dibuja.
import type { Brand } from '@/lib/brand';
import { hermes } from '@/lib/hermes';
import { HeaderBar, type CategoriaDelMenu } from './HeaderBar';

async function menu(): Promise<{ categorias: CategoriaDelMenu[]; tono: 'light' | 'dark' }> {
  try {
    const { categories, text_color } = await hermes.catalog.categories();
    const categorias = categories
      .filter((c) => c.slug && c.name)
      .map((c) => ({
        id: c.id,
        name: c.name!,
        slug: c.slug!,
        // La foto del menú: la primera `dropdown_image` con imagen.
        image: c.dropdown_images?.find((d) => d.image && /^https?:\/\//.test(d.image))?.image ?? null,
        children: (c.children ?? [])
          .filter((h) => h.slug && h.name)
          .slice(0, 8)
          .map((h) => ({ id: h.id ?? 0, name: h.name!, slug: h.slug! })),
      }));
    return { categorias, tono: text_color === 'dark' ? 'dark' : 'light' };
  } catch (e) {
    console.error('[hermes] no pude leer las categorías del menú:', e);
    return { categorias: [], tono: 'light' };
  }
}

export async function Header({ brand }: { brand: Brand }) {
  const { categorias, tono } = await menu();
  return <HeaderBar marca={{ name: brand.name, logo: brand.logo }} categorias={categorias} tono={tono} />;
}

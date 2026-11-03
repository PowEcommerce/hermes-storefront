'use client';

import { useEffect, type ReactNode } from 'react';
import { trackSearch, trackSearchClick } from '@hermesecommerce/storefront/search';

/**
 * Medición de la página de resultados del buscador inteligente: manda la
 * búsqueda (`search`, origin `page`) al mostrarse y un `detail-page-view` al
 * hacer clic en un producto, con el `attribution_token` de la búsqueda (el
 * SDK lo guarda para atribuirle el carrito y la compra). Envuelve la grilla
 * sin tocar las tarjetas: escucha los clics en los links a /producto/<slug>.
 */
export function MedirBusqueda({
  termino,
  total,
  attributionToken,
  productos,
  children,
}: {
  termino: string;
  total: number;
  attributionToken: string | null;
  /** Los productos de la página, en orden (`position` desde 1, contando la página). */
  productos: { slug: string; pg_id: number; position: number }[];
  children: ReactNode;
}) {
  useEffect(() => {
    trackSearch({
      term: termino,
      origin: 'page',
      results_count: total,
      attribution_token: attributionToken,
      shown_products: productos.map(({ pg_id, position }) => ({ pg_id, position })),
    });
    // Una vez por búsqueda mostrada (término + token cambian con cada página o filtro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, attributionToken]);

  return (
    <div
      onClickCapture={(e) => {
        if (!attributionToken) return;
        const link = (e.target as HTMLElement).closest?.('a[href]');
        const ruta = link?.getAttribute('href')?.match(/^\/producto\/([^/?#]+)/);
        if (!ruta) return;
        const slug = decodeURIComponent(ruta[1]);
        const p = productos.find((x) => x.slug === slug);
        if (!p) return;
        trackSearchClick({
          key: slug,
          pg_id: p.pg_id,
          position: p.position,
          attribution_token: attributionToken,
          origin: 'page',
          term: termino,
        });
      }}
    >
      {children}
    </div>
  );
}

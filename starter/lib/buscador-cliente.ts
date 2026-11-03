'use client';
// Lo del buscador inteligente que corre en el NAVEGADOR: las sugerencias
// mientras se tipea y la medición del panel. La medición la manda el SDK
// (`@hermesecommerce/storefront/search`) a app/api/hermes/search-events.

import { useEffect, useRef, useState } from 'react';
import { trackSearch } from '@hermesecommerce/storefront/search';
import { RUTA_SUGERENCIAS, type SugerenciasDelPanel } from './buscador';

/**
 * Las sugerencias de `q` (con `minimo` letras o más), pedidas a la ruta de la
 * tienda con una pausa corta entre teclas y cancelando el pedido anterior.
 * `null` mientras no hay nada que mostrar; nunca tira.
 */
export function useSugerencias(q: string, minimo: number): { datos: SugerenciasDelPanel | null; de: string } {
  const [estado, setEstado] = useState<{ datos: SugerenciasDelPanel | null; de: string }>({ datos: null, de: '' });
  const termino = q.trim();
  const alcanza = termino.length >= minimo;

  useEffect(() => {
    if (!alcanza) return;
    const control = new AbortController();
    const pausa = setTimeout(async () => {
      try {
        const r = await fetch(`${RUTA_SUGERENCIAS}?q=${encodeURIComponent(termino)}`, { signal: control.signal });
        if (!r.ok) return;
        setEstado({ datos: (await r.json()) as SugerenciasDelPanel, de: termino });
      } catch {
        // cancelado o sin red: queda lo último
      }
    }, 150);
    return () => {
      clearTimeout(pausa);
      control.abort();
    };
  }, [termino, alcanza]);

  return alcanza && estado.de ? estado : { datos: null, de: '' };
}

/**
 * Mide la búsqueda del panel (`search`, origin `panel`) cuando las
 * sugerencias de un término quedan a la vista un segundo (no por tecla).
 */
export function useMedirPanel(datos: SugerenciasDelPanel | null, de: string) {
  const medido = useRef('');
  useEffect(() => {
    if (!datos || !de || medido.current === de) return;
    const t = setTimeout(() => {
      medido.current = de;
      trackSearch({
        term: de,
        origin: 'panel',
        results_count: datos.total,
        attribution_token: datos.attribution_token,
        shown_products: datos.products.flatMap((p) => (p.pg_id ? [{ pg_id: p.pg_id, position: p.position }] : [])),
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [datos, de]);
}

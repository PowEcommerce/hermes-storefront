'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useBloquearScroll, useCerrarConEscape } from '@/lib/hooks';
import styles from './Plp.module.css';

/**
 * El botón «Filtrar» y el panel lateral que abre. El contenido (el form de
 * filtros) llega dibujado del servidor; acá sólo se abre y se cierra. Al
 * aplicar, el form navega y el panel se cierra solo (cambia la URL). El
 * panel va en un portal al <body>: la barra es sticky (otro contexto de
 * apilamiento) y el panel tiene que quedar encima del header.
 */
export function PanelDeFiltros({ activos, children }: { activos: number; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  useBloquearScroll(abierto);
  useCerrarConEscape(abierto, cerrar);

  // Al cambiar la URL (se aplicaron filtros), se cierra.
  const clave = `${usePathname()}?${useSearchParams().toString()}`;
  const [ultima, setUltima] = useState(clave);
  if (ultima !== clave) {
    setUltima(clave);
    setAbierto(false);
  }

  // true sólo en el navegador (el portal necesita document.body).
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const panel = (
    <>
      <div className={`${styles.velo} ${abierto ? styles.veloVisible : ''}`} onClick={cerrar} aria-hidden="true" />
      <aside className={`${styles.panel} ${abierto ? styles.panelAbierto : ''}`} aria-label="Filtros" aria-hidden={!abierto} inert={!abierto}>
        <div className={styles.panelCabecera}>
          <p className="ui-t-nombre">Filtrar</p>
          <button type="button" className={styles.cerrar} onClick={cerrar} aria-label="Cerrar filtros">
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );

  return (
    <>
      <button type="button" className={styles.filtrar} onClick={() => setAbierto(true)} aria-expanded={abierto}>
        <SlidersHorizontal size={18} strokeWidth={1.5} />
        Filtrar{activos > 0 ? ` (${activos})` : ''}
      </button>
      {montado && createPortal(panel, document.body)}
    </>
  );
}

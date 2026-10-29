'use client';
// Hooks chicos de los paneles (menú, buscador): cerrar con Escape y no dejar
// scrollear la página de atrás mientras están abiertos.
import { useEffect, useRef } from 'react';

/**
 * Cierra un panel con Escape mientras está abierto. El listener va en
 * `document` (el foco suele quedar en el botón que abrió el panel, fuera de
 * él) y saca el foco antes de cerrar para que no quede el anillo de
 * `:focus-visible` dibujado en ese botón.
 */
export function useCerrarConEscape(abierto: boolean, alCerrar: () => void) {
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const activo = document.activeElement;
      if (activo instanceof HTMLElement) activo.blur();
      cerrar.current();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto]);
}

/**
 * Bloquea el scroll del body. En compu compensa el ancho de la barra de
 * scroll para que la página no "salte"; en pantallas táctiles la barra flota
 * y no hay nada que compensar.
 */
export function useBloquearScroll(bloqueado: boolean) {
  useEffect(() => {
    if (!bloqueado) return;
    const { overflow, paddingRight } = document.body.style;
    const flotante = window.matchMedia('(hover: none)').matches;
    const barra = flotante ? 0 : window.innerWidth - document.documentElement.clientWidth;
    if (barra > 0) document.body.style.paddingRight = `${barra}px`;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [bloqueado]);
}

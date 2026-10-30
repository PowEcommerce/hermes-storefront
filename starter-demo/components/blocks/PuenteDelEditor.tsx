'use client';

// El puente entre la vista previa (`/home/preview`, en el iframe del editor de
// inicio) y el admin de Hermes, por postMessage:
//
//   admin → tienda:  HIGHLIGHT_BLOCK { blockId } · CLEAR_HIGHLIGHT · SCROLL_TO_BLOCK { blockId }
//   tienda → admin:  BLOCK_HOVER { blockId } · BLOCK_LEAVE { blockId } · BLOCK_CLICK { blockId }
//
// Cada bloque es un `[data-block-id]` (lo pone components/blocks/PageBlocks.tsx).
// Sólo escucha mensajes del admin (ORIGENES_DEL_EDITOR) y sólo adentro de un
// iframe. Lo que manda son ids de bloques: nada privado.
import { useEffect } from 'react';
import { ORIGENES_DEL_EDITOR } from '@/lib/preview';

export function PuenteDelEditor() {
  useEffect(() => {
    if (window.parent === window) return;
    let resaltado: HTMLElement | null = null;
    const bloque = (id: unknown) =>
      typeof id === 'number' || typeof id === 'string'
        ? document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(String(id))}"]`)
        : null;
    const resaltar = (el: HTMLElement | null) => {
      if (resaltado) {
        resaltado.style.outline = '';
        resaltado.style.outlineOffset = '';
      }
      if (el) {
        el.style.outline = '2px solid #3b82f6';
        el.style.outlineOffset = '-2px';
      }
      resaltado = el;
    };

    const alMensaje = (e: MessageEvent) => {
      if (!(ORIGENES_DEL_EDITOR as readonly string[]).includes(e.origin)) return;
      const d = e.data as { type?: unknown; blockId?: unknown } | null;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'HIGHLIGHT_BLOCK') resaltar(bloque(d.blockId));
      else if (d.type === 'CLEAR_HIGHLIGHT') resaltar(null);
      else if (d.type === 'SCROLL_TO_BLOCK') {
        const el = bloque(d.blockId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          resaltar(el);
        }
      }
    };
    window.addEventListener('message', alMensaje);

    const avisar = (type: string, blockId: number) => window.parent.postMessage({ type, blockId }, '*');
    const quitar: Array<() => void> = [];
    document.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
      const blockId = Number(el.dataset.blockId);
      if (!Number.isFinite(blockId)) return;
      const entra = () => avisar('BLOCK_HOVER', blockId);
      const sale = () => avisar('BLOCK_LEAVE', blockId);
      const clic = () => avisar('BLOCK_CLICK', blockId);
      el.addEventListener('mouseenter', entra);
      el.addEventListener('mouseleave', sale);
      el.addEventListener('click', clic);
      quitar.push(() => {
        el.removeEventListener('mouseenter', entra);
        el.removeEventListener('mouseleave', sale);
        el.removeEventListener('click', clic);
      });
    });

    return () => {
      window.removeEventListener('message', alMensaje);
      quitar.forEach((q) => q());
      resaltar(null);
    };
  }, []);
  return null;
}

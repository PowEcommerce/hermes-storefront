// Solapas de la PDP (Descripción, Guía de talles…): HTML que carga cualquier
// admin de la marca en el backoffice. Igual que el bloque RichText, se
// SANITIZA en el servidor antes de inyectarlo (lib/sanitize.ts).
import { sanitizarHtml } from './sanitize';
import { linkOptions } from './links';

export interface Solapa {
  position: number;
  title: string;
  html: string;
}

const numero = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function solapasDe(
  raw: ReadonlyArray<{ position?: unknown; title?: unknown; html?: unknown }> | null | undefined,
): Solapa[] {
  return (raw ?? [])
    .map((x) => ({
      position: numero(x.position),
      title: String(x.title ?? '').trim(),
      html: sanitizarHtml(String(x.html ?? ''), linkOptions()),
    }))
    .filter((x) => x.title && x.html);
}

// Sugerencias del panel del buscador inteligente mientras se tipea
// (`GET /api/buscador/sugerencias?q=rem`). El navegador no llama a Hermes
// directo: pasa por acá, que usa el cliente del servidor (con su caché).
//
// Sin la app `buscador-inteligente` prendida contesta 404 (el header ni
// siquiera muestra el panel). Nunca tira: ante un error, sugerencias vacías.
import type { NextRequest } from 'next/server';
import { hermes } from '@/lib/hermes';
import { sugerenciasDelPanel } from '@/lib/buscador';

const VACIAS = sugerenciasDelPanel({
  terms: [],
  categories: [],
  brands: [],
  attrs: [],
  products: [],
  total: 0,
  corrected_query: null,
  redirect: null,
  attribution_token: '',
  explain: null,
});

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!(await hermes.catalog.searchEnabled())) return Response.json(VACIAS, { status: 404 });
  if (!q) return Response.json(VACIAS);
  try {
    const r = await hermes.catalog.suggest(q, { limit: 6 });
    return Response.json(sugerenciasDelPanel(r));
  } catch (e) {
    console.error('[hermes] sugerencias del buscador:', e);
    return Response.json(VACIAS);
  }
}

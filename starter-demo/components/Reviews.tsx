// Reseñas de la PDP: sólo si la marca tiene la app Reseñas prendida para la
// ficha (settings/integrations → resenas.enabled && resenas.pdp).
import type { ReviewList } from '@hermesecommerce/storefront';
import { hermes } from '@/lib/hermes';

async function resenasPrendidas(): Promise<boolean> {
  try {
    const { data } = await hermes.api.GET('/api/v2/settings/integrations');
    return Boolean(data.resenas?.enabled && data.resenas.pdp !== false);
  } catch {
    return false;
  }
}

const estrellas = (n: number) => '★★★★★'.slice(0, Math.round(n)).padEnd(5, '☆');

export async function Reviews({ slug }: { slug: string }) {
  if (!(await resenasPrendidas())) return null;
  let lista: ReviewList;
  try {
    lista = await hermes.reviews.list(slug);
  } catch {
    // 404 = la app se apagó entre medio: no mostramos nada.
    return null;
  }

  return (
    <section aria-labelledby="resenas" className="border-t border-border pt-10">
      <h2 id="resenas" className="mb-4 text-2xl font-semibold">
        Opiniones
      </h2>
      {lista.rating ? (
        <p className="mb-6">
          <span className="text-lg" aria-hidden>
            {estrellas(lista.rating.average)}
          </span>{' '}
          <strong>{lista.rating.average.toFixed(1)}</strong>{' '}
          <span className="text-muted-fg">({lista.rating.count} opiniones)</span>
        </p>
      ) : (
        <p className="text-muted-fg">Todavía no hay opiniones de este producto.</p>
      )}
      <ul className="space-y-6">
        {lista.reviews.map((r) => (
          <li key={r.id} className="space-y-1 text-sm">
            <p aria-label={`${r.rating} de 5`}>{estrellas(r.rating)}</p>
            {r.title && <p className="font-medium">{r.title}</p>}
            {r.body && <p>{r.body}</p>}
            <p className="text-muted-fg">
              {r.author}
              {r.verified && ' · Compra verificada'} · {new Date(r.published_at).toLocaleDateString('es-AR')}
            </p>
            {r.reply && <p className="ml-4 border-l-2 border-border pl-3 text-muted-fg">{r.reply.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

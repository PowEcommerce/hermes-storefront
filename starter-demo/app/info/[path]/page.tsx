// Páginas estáticas del backoffice (envíos, cambios, términos…) en
// /info/<path>, con el HTML de la marca SANITIZADO en el servidor.
// Cacheadas con los tags `static_contents` / `static-content-<path>`.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { linkOptions } from '@/lib/links';
import { sanitizarHtml } from '@/lib/sanitize';

/** null = no existe (404); un 5xx se tira para no cachear un "no existe" falso. */
const estatica = (path: string) => hermes.content.staticContent(path);

export async function generateMetadata({ params }: PageProps<'/info/[path]'>): Promise<Metadata> {
  const { path } = await params;
  const p = await estatica(path).catch(() => null);
  return { title: p?.title || path, description: p?.description ?? undefined };
}

export default async function EstaticaPage({ params }: PageProps<'/info/[path]'>) {
  const { path } = await params;
  const p = await estatica(path);
  if (!p) notFound();
  const html = sanitizarHtml(p.html_content, linkOptions());
  return (
    <article className="ui-pagina">
      <div className="mx-auto max-w-3xl">
        <h1 className="ui-t-titulo mb-6">{p.title}</h1>
        {/* HTML que carga la marca en su backoffice, ya sanitizado (lib/sanitize.ts) */}
        <div className="prose-html ui-t-cuerpo" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </article>
  );
}

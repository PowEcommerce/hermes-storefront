// Landings armadas en el backoffice, en /pages/<slug>: la misma URL que ya
// usan las marcas (y que enlazan sus propios bloques), así una marca que se
// muda a esta tienda conserva el SEO y los links sin redirects.
// Datos con tags `landings` + `landing-<slug>` (purgados al guardar).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { getLanding, productsForBlocks } from '@/lib/content';
import { PageBlocks } from '@/components/blocks/PageBlocks';

/** Las landings publicadas se prerenderizan (son pocas); una nueva se genera al primer pedido. */
export async function generateStaticParams() {
  try {
    const { landings } = await hermes.content.landings();
    return landings.filter((l) => l.slug).map((l) => ({ slug: l.slug! }));
  } catch (e) {
    console.error('[hermes] landings:', e);
    return [];
  }
}

export async function generateMetadata({ params }: PageProps<'/pages/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const l = await getLanding(slug).catch(() => null);
  if (!l) return { title: slug };
  return {
    title: l.seo_title || l.title || slug,
    description: l.seo_description ?? undefined,
    openGraph: l.seo_image ? { images: [l.seo_image] } : undefined,
  };
}

export default async function LandingPage({ params }: PageProps<'/pages/[slug]'>) {
  const { slug } = await params;
  // 404 → notFound(); un 5xx se tira (error.tsx) para no cachear un "no existe" falso.
  const landing = await getLanding(slug);
  if (!landing) notFound();
  const products = await productsForBlocks(landing.blocks);
  return (
    <div className="space-y-8">
      {landing.title && <h1 className="sr-only">{landing.title}</h1>}
      <PageBlocks page={landing.blocks} products={products} />
    </div>
  );
}

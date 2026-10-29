import { linkOptions } from '@/lib/links';
import { sanitizarHtml } from '@/lib/sanitize';
import type { BlockProps } from './shared';

/** HTML del backoffice, SANITIZADO en el servidor (ver lib/sanitize.ts). */
export function RichTextBlock({ block: b }: BlockProps<'PageBlock::RichText'>) {
  const html = sanitizarHtml(b.body, linkOptions());
  if (!html) return null;
  return (
    <div
      className="prose-html mx-auto max-w-3xl py-4 text-center [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_iframe]:aspect-video [&_iframe]:w-full [&_img]:mx-auto [&_img]:h-auto [&_img]:max-w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import { linkOptions } from '@/lib/links';
import { sanitizarHtml } from '@/lib/sanitize';
import type { BlockProps } from './shared';
import styles from './Blocks.module.css';

/** HTML del backoffice, SANITIZADO en el servidor (ver lib/sanitize.ts), centrado como intro. */
export function RichTextBlock({ block: b }: BlockProps<'PageBlock::RichText'>) {
  const html = sanitizarHtml(b.body, linkOptions());
  if (!html) return null;
  return <div className={`prose-html ${styles.richText}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

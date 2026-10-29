// HTML del backoffice (bloque RichText, páginas estáticas): lo escribe
// cualquier admin de la marca y esta tienda lo publica en su dominio, así que
// se SANITIZA en el servidor antes de inyectarlo. Lista blanca: texto y
// formato, links, imágenes https e iframes sólo de YouTube/Vimeo. Sin
// <script>, sin on*, sin style, sin class. Recién después de sanitizar se
// resuelven los links (dominio propio → ruta de la tienda).
import sanitizeHtml from 'sanitize-html';
import { resolveHref, type ResolveHrefOptions } from '@hermesecommerce/storefront';

const TAGS = [
  'p', 'br', 'hr', 'div', 'span', 'section',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
  'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'iframe',
];

export function sanitizarHtml(html: string | null | undefined, links: ResolveHrefOptions = {}): string {
  if (!html || !html.trim()) return '';
  return sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http'], iframe: ['https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
    ],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tag, attribs) => {
        const r = resolveHref(attribs.href, links);
        const out: Record<string, string> = {};
        if (attribs.title) out.title = attribs.title;
        if (r) {
          out.href = r.href;
          if (r.external || attribs.target === '_blank') {
            out.target = '_blank';
            out.rel = 'noopener noreferrer';
          }
        }
        return { tagName: 'a', attribs: out };
      },
      img: (tag, attribs) => ({
        tagName: 'img',
        attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
      }),
      iframe: (tag, attribs) => ({
        tagName: 'iframe',
        attribs: { ...attribs, loading: 'lazy' },
      }),
    },
  });
}

// ============================================================
// Las páginas del sitio salen de los .md del repo (docs/, los README de los
// paquetes): cada página los incluye con `<!--@include: …-->`, no se copian.
// Acá se arreglan los links de esos .md para que apunten a la página del
// sitio o, si no tiene página, a GitHub.
// ============================================================
import type { MarkdownRenderer } from 'vitepress';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GITHUB = 'https://github.com/PowEcommerce/hermes-storefront';

/** Archivo o carpeta del repo → ruta del sitio. */
const RUTAS: Record<string, string> = {
  'docs/guia-agencias.md': '/guias/agencias',
  'docs/cli.md': '/guias/cli',
  'packages/cli': '/guias/cli-comandos',
  'packages/cli/README.md': '/guias/cli-comandos',
  'packages/storefront': '/sdk/',
  'packages/storefront/README.md': '/sdk/',
  'packages/storefront/openapi.yaml': '/api/',
  'packages/storefront/examples': '/sdk/ejemplos',
  'packages/storefront/examples/next-app-router': '/sdk/ejemplos',
};

export function leer(relativo: string): string {
  return fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
}

/** Un link relativo de `origen` (ruta del repo) → ruta del sitio o URL de GitHub. */
export function resolverLink(origen: string, destino: string): string {
  // Los README de npm linkean a GitHub con la URL entera: si tiene página acá, va acá.
  const enGithub = destino.match(
    new RegExp(`^${GITHUB.replace(/[.]/g, '\\.')}/(?:blob|tree)/main/([^#]+?)/?(#.*)?$`),
  );
  if (enGithub && RUTAS[enGithub[1]]) return RUTAS[enGithub[1]] + (enGithub[2] ?? '');
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(destino)) return destino;
  const [ruta, ancla] = destino.split('#') as [string, string | undefined];
  const repo = path.posix.normalize(path.posix.join(path.posix.dirname(origen), ruta)).replace(/\/$/, '');
  const hash = ancla ? `#${ancla}` : '';
  if (RUTAS[repo]) return RUTAS[repo] + hash;
  let esCarpeta = false;
  try {
    esCarpeta = fs.statSync(path.join(RAIZ, repo)).isDirectory();
  } catch {
    // Si no existe, que quede como link a GitHub igual (lo ve el que lo clickee).
  }
  return `${GITHUB}/${esCarpeta ? 'tree' : 'blob'}/main/${repo}${hash}`;
}

// Mismo slug que usa VitePress para las anclas de los títulos.
export function slug(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** Los títulos `##`/`###` de un .md (fuera del código), con su ancla. */
export function titulos(relativo: string): { nivel: number; texto: string; ancla: string }[] {
  const out: { nivel: number; texto: string; ancla: string }[] = [];
  let enCodigo = false;
  for (const linea of leer(relativo).split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(linea)) enCodigo = !enCodigo;
    if (enCodigo) continue;
    const m = linea.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) {
      const texto = m[2].replace(/`/g, '');
      out.push({ nivel: m[1].length, texto, ancla: slug(texto) });
    }
  }
  return out;
}

/** Página del sitio → el .md del repo que incluye (para resolver sus links relativos). */
export const PAGINAS: Record<string, string> = {
  'guias/agencias.md': 'docs/guia-agencias.md',
  'guias/cli.md': 'docs/cli.md',
  'guias/cli-comandos.md': 'packages/cli/README.md',
  'sdk/index.md': 'packages/storefront/README.md',
};

/** Plugin de markdown-it: los links de un .md incluido, resueltos desde su ubicación en el repo. */
export function linksDelRepo(md: MarkdownRenderer): void {
  md.core.ruler.push('hermes-links-del-repo', (state) => {
    const fuente = PAGINAS[(state.env as { relativePath?: string }).relativePath ?? ''];
    if (!fuente) return;
    for (const token of state.tokens) {
      for (const hijo of token.children ?? []) {
        if (hijo.type !== 'link_open') continue;
        const href = hijo.attrGet('href');
        if (href) hijo.attrSet('href', resolverLink(fuente, href));
      }
    }
  });
}

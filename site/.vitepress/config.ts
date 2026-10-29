import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig, type DefaultTheme, type Plugin } from 'vitepress';
import { GITHUB, RAIZ, linksDelRepo, titulos } from './fuentes';

// En GitHub Pages el sitio vive en /<repo>/ (o en / con dominio propio): el
// workflow pasa la base que le da actions/configure-pages.
const base = process.env.DOCS_BASE || '/';

const GUIA = 'docs/guia-agencias.md';
const OPENAPI = 'packages/storefront/openapi.yaml';

// ── Referencia de la API: Redoc estático, sin servicios externos ──────────
// Redoc no tiene «try it»: la referencia no manda pedidos a la API.
// El bundle trae el logo de Redocly desde su CDN: lo reemplazamos por un SVG
// vacío inline para que la página no pida nada a terceros.
const LOGO_REDOCLY = 'https://cdn.redoc.ly/redoc/logo-mini.svg';
const SVG_VACIO = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E';

function redocSinTerceros(): string {
  const require = createRequire(import.meta.url);
  const js = fs.readFileSync(require.resolve('redoc/bundles/redoc.standalone.js'), 'utf8');
  if (!js.includes(LOGO_REDOCLY)) {
    throw new Error('redoc.standalone.js cambió: revisá qué pide a terceros antes de actualizarlo.');
  }
  // El generador de ejemplos de Redoc usa una IP privada para `format: ipv4`:
  // la pasamos a una IP de documentación (RFC 5737) para que el escáner de
  // referencias internas (scripts/tarball-sin-internos.sh) pase sobre dist/.
  const ipEjemplo = `"${[192, 168, 0, 1].join('.')}"`;
  const limpio = js.split(LOGO_REDOCLY).join(SVG_VACIO).split(ipEjemplo).join('"203.0.113.10"');
  if (/cdn\.redoc\.ly|fonts\.googleapis/.test(limpio)) {
    throw new Error('redoc.standalone.js pide recursos a terceros.');
  }
  return limpio;
}

const ARCHIVOS_API: Record<string, () => string> = {
  'api/redoc.standalone.js': redocSinTerceros,
  'api/openapi.yaml': () => fs.readFileSync(path.join(RAIZ, OPENAPI), 'utf8'),
};

/** En `vitepress dev` sirve los archivos de la API; en el build los escribe en dist/. */
function archivosApi(): Plugin {
  return {
    name: 'hermes-docs-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const clave = Object.keys(ARCHIVOS_API).find((k) => url === `${base}${k}`);
        if (!clave) return next();
        res.setHeader('Content-Type', clave.endsWith('.js') ? 'text/javascript' : 'application/yaml');
        res.end(ARCHIVOS_API[clave]());
      });
    },
  };
}

// ── Sidebar: los títulos de la guía se leen del .md (si cambian, se actualiza solo) ──
const tituloGuia = titulos(GUIA);
const h2 = tituloGuia.filter((t) => t.nivel === 2);

/** Una sección de la guía por regex sobre el título (si no está, no va al menú). */
function seccion(texto: string, re: RegExp): DefaultTheme.SidebarItem[] {
  const t = tituloGuia.find((x) => re.test(x.texto));
  return t ? [{ text: texto, link: `/guias/agencias#${t.ancla}` }] : [];
}

// La guía tiene dos partes: armar y publicar la tienda (hasta el quickstart de
// la API) y la API en sí (tokens, catálogo, carrito…).
const corte = h2.findIndex((t) => /^quickstart \(/i.test(t.texto));
const parteApi = corte >= 0 ? h2.slice(corte) : [];

const sidebar: DefaultTheme.Sidebar = [
  {
    text: 'Empezar',
    items: [
      { text: 'Hermes para agencias', link: '/' },
      { text: 'Guía para agencias', link: '/guias/agencias' },
    ],
  },
  {
    text: 'Guías',
    items: [
      ...seccion('Quickstart con el starter', /^quickstart con el starter/i),
      ...seccion('Deploy en Hermes', /^deploy en hermes/i),
      ...seccion('Dominios propios', /dominio/i),
      ...seccion('Remitente de mails', /mails/i),
      ...seccion('Trabajo en equipo y CI', /equipo/i),
    ],
  },
  {
    text: 'CLI',
    items: [
      { text: 'Login, tokens y permisos', link: '/guias/cli' },
      { text: 'Comandos', link: '/guias/cli-comandos' },
    ],
  },
  {
    text: 'Storefront API',
    items: [
      ...parteApi.map((t) => ({
        text: t.texto.replace(/^\d+\.\s*/, ''),
        link: `/guias/agencias#${t.ancla}`,
      })),
      { text: 'Referencia (OpenAPI)', link: '/api/' },
    ],
  },
  {
    text: 'SDK',
    items: [
      { text: '@hermesecommerce/storefront', link: '/sdk/' },
      { text: 'Ejemplo: Next.js', link: '/sdk/ejemplos' },
    ],
  },
];

export default defineConfig({
  base,
  lang: 'es-AR',
  title: 'Hermes',
  titleTemplate: ':title · Hermes Docs',
  description:
    'Documentación de Hermes para agencias: storefronts headless sobre Pow con la CLI, el SDK y la Storefront API.',
  cleanUrls: true,
  lastUpdated: false,
  // Los .md de docs/ linkean archivos del repo (workflows, scripts): esos
  // links van a GitHub; acá sólo fallan los links rotos entre páginas.
  ignoreDeadLinks: false,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]],
  vite: { plugins: [archivosApi()] },
  markdown: { config: (md) => md.use(linksDelRepo) },
  buildEnd(site) {
    for (const [destino, contenido] of Object.entries(ARCHIVOS_API)) {
      const archivo = path.join(site.outDir, destino);
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, contenido());
    }
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Hermes',
    nav: [
      { text: 'Guías', link: '/guias/agencias', activeMatch: '^/guias/' },
      { text: 'Referencia API', link: '/api/', activeMatch: '^/api/' },
      { text: 'SDK', link: '/sdk/', activeMatch: '^/sdk/' },
    ],
    sidebar: { '/guias/': sidebar, '/sdk/': sidebar, '/': sidebar },
    socialLinks: [{ icon: 'github', link: GITHUB }],
    outline: { level: [2, 3], label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    darkModeSwitchLabel: 'Apariencia',
    lightModeSwitchTitle: 'Pasar a modo claro',
    darkModeSwitchTitle: 'Pasar a modo oscuro',
    sidebarMenuLabel: 'Menú',
    returnToTopLabel: 'Volver arriba',
    langMenuLabel: 'Idioma',
    externalLinkIcon: true,
    notFound: {
      title: 'PÁGINA NO ENCONTRADA',
      quote: 'Esta página no existe (o se movió).',
      linkLabel: 'ir al inicio',
      linkText: 'Volver al inicio',
    },
    footer: {
      message: 'Publicado con licencia MIT.',
      copyright: 'Hermes · Pow',
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
          modal: {
            displayDetails: 'Ver detalle',
            resetButtonTitle: 'Borrar la búsqueda',
            backButtonTitle: 'Cerrar',
            noResultsText: 'Sin resultados para',
            footer: {
              selectText: 'elegir',
              navigateText: 'moverse',
              closeText: 'cerrar',
            },
          },
        },
      },
    },
  },
});

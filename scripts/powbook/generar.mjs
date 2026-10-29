#!/usr/bin/env node
// ============================================================
// Genera las páginas de Powbook (powbook.pow.la, workspace storefront-hermes)
// desde la documentación de este repo: los .md de docs/, los README de los
// paquetes, el ejemplo de Next.js y la OpenAPI. Mismo árbol que el sitio de
// site/ (VitePress): Inicio, Guías, Storefront API, Referencia de la API y SDK.
//
//   node scripts/powbook/generar.mjs [--salida <carpeta>] [--workspace <slug>]
//
// Deja un JSON por página ({ workspace, ruta, spec }) en la carpeta de salida
// (por defecto scripts/powbook/salida/, ignorada por git) y un indice.json con
// el orden de publicación. No publica nada: cómo se publica está en el README.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { aSpec, titulos, inline } from './markdown.mjs';
import { crearReferencia } from './openapi.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GITHUB = 'https://github.com/PowEcommerce/hermes-storefront';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const WS = opcion('--workspace', 'storefront-hermes');
const SALIDA = path.resolve(opcion('--salida', path.join(RAIZ, 'scripts/powbook/salida')));

const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

// js-yaml ya es dependencia del SDK (lee la OpenAPI en sus tests).
const yaml = createRequire(path.join(RAIZ, 'packages/storefront/package.json'))('js-yaml');

// ───────────── Rutas de Powbook ─────────────

/** El slug que Powbook le da a un título (lib/slugify.ts de Powbook). */
const slugify = (t) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Link interno de Powbook: `/<workspace>/<slugs>#ancla`. El lector lo lleva a la vista pública. */
const url = (ruta, ancla) => `/${WS}/${ruta.map(slugify).join('/')}${ancla ? `#${ancla}` : ''}`;

const P = {
  inicio: ['Inicio'],
  guias: ['Guías'],
  agencias: ['Guías', 'Guía para agencias'],
  dominios: ['Guías', 'Dominios propios'],
  mails: ['Guías', 'Remitente de mails'],
  equipo: ['Guías', 'Trabajo en equipo y CI'],
  cli: ['Guías', 'La CLI'],
  comandos: ['Guías', 'Comandos de la CLI'],
  api: ['Storefront API'],
  referencia: ['Referencia de la API'],
  sdk: ['SDK'],
  ejemplo: ['SDK', 'Ejemplo: Next.js'],
  createStore: ['SDK', 'create-store'],
};

const GUIA = 'docs/guia-agencias.md';
const OPENAPI = 'packages/storefront/openapi.yaml';
const EJEMPLO = 'packages/storefront/examples/next-app-router';

/** Archivo o carpeta del repo → página de Powbook (lo demás va a GitHub). */
const RUTAS = {
  'docs/cli.md': P.cli,
  'packages/cli': P.comandos,
  'packages/cli/README.md': P.comandos,
  'packages/storefront': P.sdk,
  'packages/storefront/README.md': P.sdk,
  [OPENAPI]: P.referencia,
  'packages/storefront/examples': P.ejemplo,
  [EJEMPLO]: P.ejemplo,
  'packages/create-store': P.createStore,
  'packages/create-store/README.md': P.createStore,
};

/** Rutas del sitio de VitePress (site/) → archivo del repo, para los links del inicio. */
const RUTAS_DEL_SITIO = {
  '/guias/agencias': GUIA,
  '/guias/cli': 'docs/cli.md',
  '/guias/cli-comandos': 'packages/cli',
  '/api/': OPENAPI,
  '/api': OPENAPI,
  '/sdk/': 'packages/storefront',
  '/sdk': 'packages/storefront',
  '/sdk/ejemplos': EJEMPLO,
};

// ───────────── La guía, partida en páginas ─────────────

const guia = leer(GUIA);
const lineasGuia = guia.split('\n');
const hs = titulos(guia);
const buscar = (nivel, re) => {
  const h = hs.find((x) => x.nivel === nivel && re.test(x.texto));
  if (!h) throw new Error(`No encontré en ${GUIA} el título ${'#'.repeat(nivel)} ${re}: ¿cambió la guía?`);
  return h;
};
const hDominio = buscar(3, /^tu dominio/i);
const hMails = buscar(3, /mails de la marca/i);
const hEquipo = buscar(3, /^trabajar en equipo/i);
const hApi = buscar(2, /^quickstart \(/i);

/** Las partes de la guía: [desde, hasta) en líneas, la página y el nivel del título que es la página. */
const partes = [
  { desde: (hs.find((h) => h.nivel === 1)?.linea ?? -1) + 1, hasta: hDominio.linea, ruta: P.agencias, nivel: 1 },
  { desde: hDominio.linea, hasta: hMails.linea, ruta: P.dominios, nivel: 3 },
  { desde: hMails.linea, hasta: hEquipo.linea, ruta: P.mails, nivel: 3 },
  { desde: hEquipo.linea, hasta: hApi.linea, ruta: P.equipo, nivel: 3 },
];
const h2Api = hs.filter((h) => h.nivel === 2 && h.linea >= hApi.linea);
h2Api.forEach((h, i) => {
  const titulo = /^quickstart \(/i.test(h.texto) ? 'Quickstart de la API' : h.texto.replace(/^\d+\.\s*/, '');
  partes.push({ desde: h.linea, hasta: h2Api[i + 1]?.linea ?? lineasGuia.length, ruta: [...P.api, titulo], nivel: 2 });
});

// Ancla de la guía (la de VitePress) → página y ancla dentro de la página.
const anclasGuia = new Map();
for (const parte of partes) {
  const texto = lineasGuia.slice(parte.desde, parte.hasta).join('\n');
  const propios = titulos(texto);
  const globales = hs.filter((h) => h.linea >= parte.desde && h.linea < parte.hasta);
  globales.forEach((g, i) => {
    const esLaPagina = g.linea === parte.desde && parte.nivel > 1;
    const destino = { ruta: parte.ruta, ancla: esLaPagina ? '' : propios[i]?.ancla ?? g.ancla };
    anclasGuia.set(g.ancla, destino);
    // Los README que se leen en GitHub o npm linkean con el ancla de GitHub (`#8-cache-y-purga`).
    const deGithub = g.texto.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    if (!anclasGuia.has(deGithub)) anclasGuia.set(deGithub, destino);
  });
}

// ───────────── Links ─────────────

/** Cómo queda un link de un .md del repo (`origen`) en Powbook. */
function resolverDe(origen, rutaPagina) {
  return (destino) => {
    const enGithub = destino.match(new RegExp(`^${GITHUB.replace(/[.]/g, '\\.')}/(?:blob|tree)/main/([^#]+?)/?(#.*)?$`));
    if (enGithub) {
      if (RUTAS[enGithub[1]]) return url(RUTAS[enGithub[1]]) + (enGithub[2] ?? '');
      return destino;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(destino) || destino.startsWith('//')) return destino;
    // Una ruta del sitio de VitePress (`/guias/agencias#…`) o un link ya resuelto.
    if (destino.startsWith('/')) return RUTAS_DEL_SITIO[destino.split('#')[0]] ? linkDelSitio(destino) : destino;
    const [ruta, ancla] = destino.split('#');
    const repo = ruta
      ? path.posix.normalize(path.posix.join(path.posix.dirname(origen), ruta)).replace(/\/$/, '')
      : origen;
    if (repo === GUIA) {
      const a = ancla ? anclasGuia.get(ancla) : null;
      if (a) {
        if (rutaPagina && a.ruta.join('/') === rutaPagina.join('/')) return a.ancla ? `#${a.ancla}` : url(a.ruta);
        return url(a.ruta, a.ancla);
      }
      return url(P.agencias, ancla);
    }
    if (!ruta) return `#${ancla}`;
    if (RUTAS[repo]) return url(RUTAS[repo], ancla);
    let carpeta = false;
    try {
      carpeta = fs.statSync(path.join(RAIZ, repo)).isDirectory();
    } catch {
      // Si no existe, link a GitHub igual.
    }
    return `${GITHUB}/${carpeta ? 'tree' : 'blob'}/main/${repo}${ancla ? `#${ancla}` : ''}`;
  };
}

/** Un link de una ruta del sitio (`/guias/agencias#tu-dominio`) → Powbook. */
function linkDelSitio(destino) {
  const [r, a] = destino.split('#');
  const repo = RUTAS_DEL_SITIO[r];
  if (!repo) return destino;
  if (repo === GUIA) {
    const x = a ? anclasGuia.get(a) : null;
    return x ? url(x.ruta, x.ancla) : url(P.agencias);
  }
  return url(RUTAS[repo], a);
}

// ───────────── Páginas ─────────────

const paginas = [];
const agregar = (ruta, spec, fuente) => paginas.push({ workspace: WS, ruta, fuente, spec });

/** Un .md entero (sin su título #) → spec. */
const mdEntero = (rel, ruta) => aSpec(leer(rel), { resolver: resolverDe(rel, ruta) });

// Inicio: el hero, las tarjetas y el cuerpo de site/index.md.
{
  const fuente = leer('site/index.md');
  const fm = fuente.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = fm ? yaml.load(fm[1]) : {};
  const cuerpo = fm ? fuente.slice(fm[0].length) : fuente;
  const resolver = resolverDe('site/index.md', P.inicio);
  const spec = [];
  if (meta.hero) {
    spec.push(['parrafo', `**${meta.hero.name}: ${meta.hero.text}.** ${inline(meta.hero.tagline ?? '')}`]);
    const acciones = (meta.hero.actions ?? []).map((a) => `[${a.text}](${resolver(a.link)})`);
    if (acciones.length) spec.push(['parrafo', `Empezá por acá: ${acciones.join(' · ')}.`]);
  }
  if (meta.features?.length) {
    spec.push([
      'tarjetas',
      meta.features.map((f) => ({ titulo: f.title, descripcion: f.details, link: f.link ? resolver(f.link) : '' })),
    ]);
  }
  spec.push(...aSpec(cuerpo, { resolver }));
  agregar(P.inicio, spec, 'site/index.md');
}

// Guías
agregar(
  P.guias,
  [
    ['parrafo', 'Cómo se arma, se publica y se opera una tienda de Hermes: el recorrido de la agencia, el dominio y los mails de la marca, el trabajo en equipo con CI y la CLI `hermes`.'],
  ],
  null,
);

for (const parte of partes) {
  const texto = lineasGuia.slice(parte.desde, parte.hasta).join('\n');
  const niveles = { 1: null, 2: 'titulo', 3: 'titulo3', 4: 'titulo3', 5: 'titulo3', 6: 'titulo3' };
  if (parte.nivel > 1) {
    niveles[parte.nivel] = null;
    niveles[parte.nivel + 1] = 'titulo';
    for (let n = parte.nivel + 2; n <= 6; n++) niveles[n] = 'titulo3';
  }
  // Las secciones de la guía que quedan como página propia empiezan con su título: se saca.
  const sinTitulo = parte.nivel > 1 ? texto.split('\n').slice(1).join('\n') : texto;
  const spec = aSpec(sinTitulo, { resolver: resolverDe(GUIA, parte.ruta), niveles });
  if (parte.ruta[0] === P.api[0] && !paginas.some((p) => p.ruta.join('/') === P.api.join('/'))) {
    agregar(
      P.api,
      [
        ['parrafo', `La Storefront API v2, de los tokens al checklist antes de salir a producción. Cada endpoint, con sus parámetros y respuestas, está en la [Referencia de la API](${url(P.referencia)}); el cliente tipado, en el [SDK](${url(P.sdk)}).`],
      ],
      null,
    );
  }
  agregar(parte.ruta, spec, GUIA);
  if (parte.ruta === P.equipo) {
    agregar(P.cli, mdEntero('docs/cli.md', P.cli), 'docs/cli.md');
    agregar(P.comandos, mdEntero('packages/cli/README.md', P.comandos), 'packages/cli/README.md');
  }
}

// Referencia de la API: portada + una página por grupo.
{
  const doc = yaml.load(leer(OPENAPI));
  const ref = crearReferencia(doc, { resolver: resolverDe(OPENAPI, P.referencia) });
  const servidor = doc.servers?.[0]?.url ?? 'https://api.pow.la';
  const spec = [
    ...aSpec(doc.info?.description ?? '', { resolver: resolverDe(OPENAPI, P.referencia) }),
    ['callout', `La referencia sale de la OpenAPI 3.1 del repo: también la podés bajar de \`${servidor}/api/v2/openapi.json\` (o \`.yaml\`) y abrirla con Redocly, Scalar, Postman o Insomnia, o generar un cliente tipado.`, 'info'],
    ['titulo', 'Autenticación', {}],
    ['tabla', ref.tablaAutenticacion()],
    ['titulo', 'Grupos', {}],
    ['tarjetas', ref.grupos.slice(0, 12).map((g) => ({ titulo: g.nombre, descripcion: g.descripcion.replace(/`/g, ''), link: url([...P.referencia, g.nombre]) }))],
  ];
  agregar(P.referencia, spec, OPENAPI);
  for (const g of ref.grupos) agregar([...P.referencia, g.nombre], ref.pagina(g), OPENAPI);
}

// SDK: el README, el ejemplo de Next.js y create-store.
agregar(P.sdk, mdEntero('packages/storefront/README.md', P.sdk), 'packages/storefront/README.md');
{
  const archivos = [
    '.env.example',
    'lib/pow.ts',
    'app/layout.tsx',
    'app/page.tsx',
    'app/carrito/page.tsx',
    'app/gracias/page.tsx',
    'app/api/cart/route.ts',
    'app/api/checkout/route.ts',
    'app/api/webhooks/pow/route.ts',
    'app/api/hermes/revalidate/route.ts',
  ];
  const lenguaje = (a) => (a.endsWith('.tsx') ? 'tsx' : a.endsWith('.ts') ? 'ts' : 'bash');
  const spec = [
    ['parrafo', `Una tienda mínima con el SDK: listado de productos, carrito, checkout hosteado, webhooks firmados y purga de caché por tags. El código completo está en [${EJEMPLO}](${GITHUB}/tree/main/${EJEMPLO}).`],
  ];
  for (const a of archivos) {
    spec.push(['titulo3', `\`${a}\``]);
    spec.push(['codigo', leer(`${EJEMPLO}/${a}`).replace(/\s+$/, ''), lenguaje(a)]);
  }
  agregar(P.ejemplo, spec, EJEMPLO);
}
agregar(P.createStore, mdEntero('packages/create-store/README.md', P.createStore), 'packages/create-store/README.md');

// ───────────── Validar contra los límites de publish_page ─────────────

const problemas = [];
for (const p of paginas) {
  const donde = p.ruta.join(' › ');
  if (!p.spec.length) problemas.push(`${donde}: sin bloques`);
  if (p.spec.length > 400) problemas.push(`${donde}: ${p.spec.length} bloques (máximo 400)`);
  for (const b of p.spec) {
    const textos = b[0] === 'tabla' ? b[1].flat() : b[0] === 'lista' ? b[1] : b[0] === 'codigo' ? [] : [b[0] === 'paso' ? b[2] : b[1]];
    for (const t of textos) if (typeof t === 'string' && t.length > (b[0] === 'tabla' ? 2000 : 4000)) problemas.push(`${donde}: un ${b[0]} de ${t.length} caracteres`);
    if (b[0] === 'codigo' && b[1].length > 20000) problemas.push(`${donde}: código de ${b[1].length} caracteres`);
    if (b[0] === 'tabla' && (b[1].length > 200 || b[1].some((f) => f.length > 10))) problemas.push(`${donde}: tabla demasiado grande`);
    if (b[0] === 'lista' && b[1].length > 50) problemas.push(`${donde}: lista de más de 50 ítems`);
    if (['parrafo', 'callout', 'titulo', 'titulo3'].includes(b[0]) && !b[1]) problemas.push(`${donde}: ${b[0]} vacío`);
  }
}
if (problemas.length) {
  console.error(problemas.join('\n'));
  process.exit(1);
}

// ───────────── Escribir ─────────────

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });
const indice = paginas.map((p, i) => {
  const archivo = `${String(i + 1).padStart(2, '0')}-${p.ruta.map(slugify).join('--')}.json`;
  fs.writeFileSync(path.join(SALIDA, archivo), `${JSON.stringify({ workspace: p.workspace, ruta: p.ruta, spec: p.spec }, null, 2)}\n`);
  return { archivo, ruta: p.ruta, link: url(p.ruta), fuente: p.fuente, bloques: p.spec.length };
});
fs.writeFileSync(path.join(SALIDA, 'indice.json'), `${JSON.stringify({ workspace: WS, paginas: indice }, null, 2)}\n`);
console.log(`${paginas.length} páginas en ${path.relative(process.cwd(), SALIDA) || '.'}:`);
for (const p of indice) console.log(`  ${p.archivo.padEnd(58)} ${String(p.bloques).padStart(3)} bloques  ${p.ruta.join(' › ')}`);

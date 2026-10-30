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
import { aSpec, titulos, textoPlano } from './markdown.mjs';
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

// Tipo de documento en Powbook: documentación técnica (VitePress + Redoc). Lo
// piden los bloques api_operacion y hero; publish_page lo recibe como `tipo`.
const TIPO = 'tecnica';

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

/** Link de cada página de Powbook (las fijas y las partes de la guía) → su título. */
const TITULOS = new Map(Object.values(P).map((r) => [url(r), r.at(-1)]));
for (const parte of partes) TITULOS.set(url(parte.ruta), parte.ruta.at(-1));

/** Cómo queda un link de un .md del repo (`origen`) en Powbook. */
function resolverDe(origen, rutaPagina) {
  const resolver = (destino) => {
    // Un link absoluto a un archivo del repo en GitHub (`…/blob/main/docs/x.md#ancla`,
    // como los de los README que se leen en npm) se resuelve igual que uno relativo;
    // si el archivo no tiene página en Powbook, queda el link a GitHub.
    const enGithub = destino.match(new RegExp(`^${GITHUB.replace(/[.]/g, '\\.')}/(?:blob|tree)/main/([^#]+?)/?(?:#(.*))?$`));
    if (enGithub && !RUTAS[enGithub[1]] && enGithub[1] !== GUIA) return destino;
    if (!enGithub && (/^[a-z][a-z0-9+.-]*:/i.test(destino) || destino.startsWith('//'))) return destino;
    // Una ruta del sitio de VitePress (`/guias/agencias#…`) o un link ya resuelto.
    if (destino.startsWith('/')) return RUTAS_DEL_SITIO[destino.split('#')[0]] ? linkDelSitio(destino) : destino;
    const [ruta, ancla] = enGithub ? [enGithub[1], enGithub[2]] : destino.split('#');
    const repo = enGithub
      ? enGithub[1]
      : ruta
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
  // El título de la página a la que lleva un link ya resuelto (para los links cuyo texto es un path).
  resolver.titulo = (resuelto) => (resuelto.startsWith('/') ? TITULOS.get(resuelto.split('#')[0]) ?? null : null);
  return resolver;
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

// ───────────── Referencia de la API: grupos grandes en subpáginas ─────────────

/**
 * Hasta cuánto puede pesar el spec de una página de la referencia (JSON
 * minificado, en bytes). publish_page recibe la página entera en una sola
 * llamada y las de más de ~75 KB no entran: un grupo que pesa más se parte.
 */
const MAX_REFERENCIA = 60_000;
const pesa = (spec) => Buffer.byteLength(JSON.stringify(spec));

/**
 * Cómo se parte cada grupo (tag) de la OpenAPI cuando no entra en una página,
 * en el orden de las subpáginas. Una operación va al subgrupo con el prefijo de
 * path más largo que le corresponde (`/a/b` agarra `/a/b` y `/a/b/…`, no
 * `/a/bc`). Una operación con `x-subgrupo` en la OpenAPI va a ese subgrupo
 * (gana sobre el prefijo). Un grupo que no está acá se parte solo, por el
 * primer segmento del path después de `/api/v2` (o `/api`).
 */
const SUBGRUPOS = {
  Catálogo: [
    { nombre: 'Listados y categorías', descripcion: 'El árbol de categorías del menú, los listados de productos (PLP) y sus filtros.', prefijos: ['/api/v2/products', '/api/v2/categories'] },
    { nombre: 'Ficha de producto', descripcion: 'La ficha (PDP), productos por SKU y cómo resolver la variante de las opciones elegidas.', prefijos: ['/api/v2/items'] },
    { nombre: 'Color, relacionados y look', descripcion: 'Cambiar de color en la ficha, los productos relacionados y «Completá tu look».', prefijos: ['/api/v2/items/{id}/change_variant', '/api/v2/items/{id}/related', '/api/v2/items/{id}/look'] },
    { nombre: 'Búsqueda', descripcion: 'El buscador: el panel antes de tipear, las sugerencias, la página de resultados y los eventos.', prefijos: ['/api/v2/search'] },
    { nombre: 'Catálogo crudo y sitemap', descripcion: 'El listado crudo del catálogo con sus facetas y los datos para armar el sitemap.', prefijos: ['/api/storefront'] },
  ],
  // Por etapa, en el orden del checkout: identificación, envío, facturación, pago.
  Checkout: [
    { nombre: 'Estado e identificación', descripcion: 'El estado del checkout, la identificación del comprador invitado y su IP.', prefijos: ['/api/v2/checkout'] },
    { nombre: 'Envío', descripcion: 'Los métodos de entrega disponibles y cómo guardar el envío elegido.', prefijos: ['/api/v2/checkout/shipping'] },
    { nombre: 'Cotización del envío', descripcion: 'Cotizar el envío por código postal antes de elegirlo.', prefijos: ['/api/v2/checkout/shipping/quote'] },
    { nombre: 'Sucursales y locales', descripcion: 'Las sucursales del correo y los locales de la marca para retirar.', prefijos: ['/api/v2/checkout/shipping/stores', '/api/v2/checkout/shipping/subsidiaries'] },
    { nombre: 'Facturación y geografía', descripcion: 'Guardar la facturación, y las provincias, ciudades y códigos postales para los formularios de dirección.', prefijos: ['/api/v2/checkout/billing', '/api/v2/geo'] },
    { nombre: 'Pago y confirmación', descripcion: 'Los medios de pago habilitados, pagar con cada uno y la confirmación de la orden.', prefijos: ['/api/v2/checkout/payment', '/api/v2/checkout/orders'] },
  ],
  Cuenta: [
    { nombre: 'Sesión', descripcion: 'Ingresar (email y contraseña, código por mail o Google), crear la cuenta, renovar y cerrar la sesión.', prefijos: ['/api/v2/users'] },
    { nombre: 'Pedidos', descripcion: 'Los pedidos del comprador logueado: el listado, el detalle y la cancelación.', prefijos: ['/api/v2/users/orders'] },
    { nombre: 'Direcciones y perfil', descripcion: 'Las direcciones guardadas, el perfil y el cambio de contraseña.', prefijos: ['/api/v2/users/addresses', '/api/v2/users/profile', '/api/v2/users/password'] },
  ],
};

const bajoPrefijo = (ruta, prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo.replace(/\/$/, '')}/`);

/** Las subpáginas de un grupo que no entra en una página: [{ nombre, descripcion, ops }], sin las vacías. */
function partirGrupo(g) {
  const subs = (SUBGRUPOS[g.nombre] ?? []).map((s) => ({ ...s, ops: [] }));
  const porNombre = new Map(subs.map((s) => [s.nombre, s]));
  const subgrupo = (nombre) => {
    if (!porNombre.has(nombre)) {
      const s = { nombre, descripcion: '', prefijos: [], ops: [] };
      subs.push(s);
      porNombre.set(nombre, s);
    }
    return porNombre.get(nombre);
  };
  for (const o of g.ops) {
    let destino = o.op['x-subgrupo'] ? subgrupo(o.op['x-subgrupo']) : null;
    let largo = -1;
    for (const s of destino ? [] : subs) {
      for (const p of s.prefijos) if (bajoPrefijo(o.ruta, p) && p.length > largo) [destino, largo] = [s, p.length];
    }
    if (!destino) {
      // Sin subgrupo: por el primer segmento después de /api/v2 (o /api): `users` → «Users».
      const segmento = o.ruta.replace(/^\/api(\/v\d+)?\//, '').split('/')[0].replace(/[_-]+/g, ' ');
      destino = subgrupo(segmento.charAt(0).toUpperCase() + segmento.slice(1));
    }
    destino.ops.push(o);
  }
  return subs.filter((s) => s.ops.length);
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
    // La portada de VitePress (hero): nombre, texto, bajada y botones.
    spec.push([
      'hero',
      {
        nombre: meta.hero.name,
        ...(meta.hero.text ? { texto: meta.hero.text } : {}),
        ...(meta.hero.tagline ? { tagline: textoPlano(meta.hero.tagline) } : {}),
        acciones: (meta.hero.actions ?? []).map((a) => ({
          texto: a.text,
          link: resolver(a.link),
          tema: a.theme === 'brand' ? 'brand' : 'alt',
        })),
      },
    ]);
  }
  if (meta.features?.length) {
    spec.push([
      'tarjetas',
      meta.features.map((f) => ({
        titulo: f.title,
        descripcion: f.details,
        link: f.link ? resolver(f.link) : '',
        ...(f.linkText ? { texto_link: f.linkText } : {}),
      })),
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

// Referencia de la API: portada + una página por grupo. Un grupo que no entra en
// una llamada de publish_page (más de MAX_REFERENCIA bytes de spec) se parte en
// subpáginas y su página queda como índice (ver partirGrupo, más arriba).
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
  for (const g of ref.grupos) {
    const ruta = [...P.referencia, g.nombre];
    const entera = ref.pagina(g);
    if (pesa(entera) <= MAX_REFERENCIA) {
      agregar(ruta, entera, OPENAPI);
      continue;
    }
    // La página del grupo queda como índice (sin las operaciones): la descripción
    // del tag, una tarjeta por subpágina y qué operación está en cuál.
    const subs = partirGrupo(g);
    const link = (s) => url([...ruta, s.nombre]);
    agregar(
      ruta,
      [
        ...(g.descripcion ? aSpec(g.descripcion, { resolver: resolverDe(OPENAPI, P.referencia) }) : []),
        ['tarjetas', subs.map((s) => ({ titulo: s.nombre, descripcion: s.descripcion || s.ops.map((o) => o.op.summary).join(' · ').slice(0, 400), link: link(s) }))],
        ['titulo', 'Operaciones', {}],
        ['tabla', [['Operación', 'Qué hace', 'Página'], ...subs.flatMap((s) => s.ops.map((o) => [`\`${o.metodo.toUpperCase()} ${o.ruta}\``, (o.op.summary ?? '').replace(/\s+/g, ' ').trim(), `[${s.nombre}](${link(s)})`]))]],
      ],
      OPENAPI,
    );
    for (const s of subs) {
      TITULOS.set(link(s), s.nombre);
      agregar([...ruta, s.nombre], ref.pagina({ descripcion: s.descripcion, ops: s.ops }), OPENAPI);
    }
  }
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
  if (p.ruta[0] === P.referencia[0] && pesa(p.spec) > MAX_REFERENCIA) problemas.push(`${donde}: pesa ${pesa(p.spec)} bytes (máximo ${MAX_REFERENCIA}): partila más en SUBGRUPOS`);
  for (const b of p.spec) {
    if (b[0] === 'api_operacion') {
      const datos = JSON.stringify(b[1]);
      if (datos.length > 400_000) problemas.push(`${donde}: la operación ${b[1].metodo} ${b[1].path} pesa ${datos.length} caracteres (máximo 400 KB)`);
      for (const r of [b[1].cuerpo, ...(b[1].respuestas ?? [])]) {
        if (r?.ejemplo && r.ejemplo.length > 100_000) problemas.push(`${donde}: un ejemplo de ${b[1].metodo} ${b[1].path} de ${r.ejemplo.length} caracteres`);
      }
      if ((b[1].parametros ?? []).length > 60) problemas.push(`${donde}: ${b[1].metodo} ${b[1].path} tiene más de 60 parámetros`);
      continue;
    }
    if (b[0] === 'hero') continue;
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
  fs.writeFileSync(path.join(SALIDA, archivo), `${JSON.stringify({ workspace: p.workspace, ruta: p.ruta, tipo: TIPO, spec: p.spec }, null, 2)}\n`);
  return { archivo, ruta: p.ruta, link: url(p.ruta), fuente: p.fuente, bloques: p.spec.length, bytes: pesa(p.spec) };
});
fs.writeFileSync(path.join(SALIDA, 'indice.json'), `${JSON.stringify({ workspace: WS, tipo: TIPO, paginas: indice }, null, 2)}\n`);
console.log(`${paginas.length} páginas en ${path.relative(process.cwd(), SALIDA) || '.'}:`);
for (const p of indice) console.log(`  ${p.archivo.padEnd(76)} ${String(p.bloques).padStart(3)} bloques ${String(Math.round(p.bytes / 1000)).padStart(4)} KB  ${p.ruta.join(' › ')}`);

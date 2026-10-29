// ============================================================
// Markdown → spec de Powbook.
//
// El spec es una lista de bloques: ["parrafo", texto], ["titulo", texto, {}],
// ["titulo3", texto], ["paso", n, texto], ["lista", [textos]],
// ["callout", texto, estilo], ["codigo", texto, lenguaje] y ["tabla", filas].
// El inline (negrita, itálica, `código` y [links](url)) queda en Markdown:
// Powbook lo arma.
//
// Cubre lo que usan los .md de este repo: títulos, párrafos, listas (con un
// nivel de anidado), bloques de código (también dentro de una lista), tablas,
// citas (`> **Ojo:** …` → aviso) y contenedores de VitePress (`::: warning`).
// ============================================================

/** El slug de un título, igual al de VitePress (y al de las anclas de Powbook). */
export function slug(texto) {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** El texto de un título como lo ve el lector (sin backticks ni marcas). */
export function textoPlano(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/;

/** Las líneas de un .md, marcando las que están dentro de un bloque de código (y su apertura y cierre). */
function lineas(md) {
  const out = [];
  let cerca = null;
  for (const texto of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = texto.match(FENCE);
    if (m && !cerca) {
      cerca = m[2];
      out.push({ texto, codigo: true, abre: true });
      continue;
    }
    if (m && cerca && m[2][0] === cerca[0] && m[2].length >= cerca.length && !texto.trim().slice(m[2].length).trim()) {
      cerca = null;
      out.push({ texto, codigo: true, cierra: true });
      continue;
    }
    out.push({ texto, codigo: !!cerca });
  }
  return out;
}

/**
 * Los títulos del .md (fuera del código), con su nivel, su texto, su ancla de
 * VitePress (con el sufijo -1, -2 si se repite) y la línea en la que están.
 */
export function titulos(md) {
  const usadas = new Map();
  const out = [];
  lineas(md).forEach((l, i) => {
    if (l.codigo) return;
    const m = l.texto.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) return;
    const texto = textoPlano(m[2]);
    const base = slug(texto);
    const n = usadas.get(base) ?? 0;
    usadas.set(base, n + 1);
    out.push({ nivel: m[1].length, md: m[2], texto, ancla: n ? `${base}-${n}` : base, linea: i });
  });
  return out;
}

// ───────────── Inline ─────────────

/**
 * Inline de Markdown → el inline que entiende Powbook. Powbook no anida
 * estilos dentro de un link: `[`x`](u)` y `**[x](u)**` quedan como `[x](u)`.
 */
export function inline(texto, resolver) {
  let t = texto
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1')
    // Negrita que envuelve un link (`**[x](u):**`): Powbook no anida, así que
    // la negrita queda en lo de afuera y el link sin negrita.
    .replace(/\*\*((?:(?!\*\*).)*?\[[^\]]+\]\([^)]+\)(?:(?!\*\*).)*?)\*\*/g, (_, adentro) =>
      adentro
        .split(/(\[[^\]]+\]\([^)]+\))/)
        .map((p, i) => (i % 2 ? p : p.trim() ? p.replace(/^(\s*)(.*?)(\s*)$/, '$1**$2**$3') : p))
        .join(''),
    );
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, txt, url) => {
    const limpio = txt.replace(/[`*]/g, '');
    const destino = resolver ? resolver(url) : url;
    return `[${limpio}](${destino})`;
  });
  return t.replace(/\s+/g, ' ').trim();
}

// ───────────── Bloques ─────────────

const AVISOS = [
  { re: /^\*\*(ojo|atenci[oó]n|cuidado|importante|limitaci[oó]n[^*]*|no )/i, estilo: 'warning' },
  { re: /^\*\*(tip|consejo|recomendado)/i, estilo: 'success' },
  { re: /^\*\*(peligro|nunca)/i, estilo: 'danger' },
];

function estiloDeCita(texto) {
  return AVISOS.find((a) => a.re.test(texto))?.estilo ?? 'info';
}

const CONTENEDOR = { tip: 'success', info: 'info', warning: 'warning', danger: 'danger', details: 'info', note: 'info' };

function filas(bloque) {
  const celdas = (l) => {
    const sin = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = [];
    let actual = '';
    let enCodigo = false;
    for (let i = 0; i < sin.length; i++) {
      const c = sin[i];
      if (c === '\\' && sin[i + 1] === '|') {
        actual += '|';
        i++;
        continue;
      }
      if (c === '`') enCodigo = !enCodigo;
      if (c === '|' && !enCodigo) {
        out.push(actual.trim());
        actual = '';
        continue;
      }
      actual += c;
    }
    out.push(actual.trim());
    return out;
  };
  return bloque.filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)).map(celdas);
}

/**
 * Un .md (o un pedazo) → spec.
 * - `resolver(url)`: cómo queda cada link (página de Powbook, GitHub…).
 * - `niveles`: a qué bloque va cada nivel de título (por defecto 2 → titulo,
 *   3 y más → titulo3; el 1 se descarta porque es el título de la página).
 */
export function aSpec(md, { resolver, niveles = { 1: null, 2: 'titulo', 3: 'titulo3', 4: 'titulo3', 5: 'titulo3', 6: 'titulo3' } } = {}) {
  const ls = lineas(md);
  const spec = [];
  const inl = (t) => inline(t, resolver);
  let i = 0;

  const vacia = (l) => !l || (!l.codigo && !l.texto.trim());
  const empiezaBloque = (l) =>
    !l.codigo &&
    (/^#{1,6}\s/.test(l.texto) ||
      /^\s*([-*+]|\d+[.)])\s+/.test(l.texto) ||
      /^\s*>/.test(l.texto) ||
      /^\s*\|/.test(l.texto) ||
      /^:::/.test(l.texto) ||
      /^\s*(-{3,}|\*{3,})\s*$/.test(l.texto));

  /** Un bloque de código que empieza en la línea `desde`; devuelve la línea siguiente al cierre. */
  function codigo(desde) {
    const m = ls[desde].texto.match(FENCE);
    const sangria = m[1].length;
    const cuerpo = [];
    let j = desde + 1;
    while (j < ls.length && !ls[j].cierra) {
      const linea = ls[j].texto;
      const propia = linea.length - linea.trimStart().length;
      cuerpo.push(linea.slice(Math.min(sangria, propia)));
      j++;
    }
    const texto = cuerpo.join('\n').replace(/\s+$/, '');
    if (texto) spec.push(['codigo', texto, m[3] || 'text']);
    return j + 1;
  }

  while (i < ls.length) {
    const l = ls[i];
    if (vacia(l)) {
      i++;
      continue;
    }
    const t = l.texto;

    if (l.abre) {
      i = codigo(i);
      continue;
    }

    // Título
    const h = t.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const tipo = niveles[h[1].length];
      if (tipo === 'titulo') spec.push(['titulo', inl(h[2]), {}]);
      else if (tipo === 'titulo3') spec.push(['titulo3', inl(h[2])]);
      else if (tipo === 'negrita') spec.push(['parrafo', `**${textoPlano(h[2])}**`]);
      i++;
      continue;
    }

    // Separador
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) {
      i++;
      continue;
    }

    // Contenedor de VitePress: ::: warning Título … :::
    const cont = t.match(/^:::\s*(\w+)\s*(.*)$/);
    if (cont) {
      const cuerpo = [];
      i++;
      while (i < ls.length && !/^:::\s*$/.test(ls[i].texto)) cuerpo.push(ls[i++].texto);
      i++;
      const titulo = cont[2].trim();
      const texto = [titulo ? `**${titulo}.**` : '', inl(cuerpo.join(' '))].filter(Boolean).join(' ');
      spec.push(['callout', texto, CONTENEDOR[cont[1]] ?? 'info']);
      continue;
    }

    // Cita → aviso
    if (/^\s*>/.test(t)) {
      const cuerpo = [];
      while (i < ls.length && !ls[i].codigo && /^\s*>/.test(ls[i].texto)) {
        cuerpo.push(ls[i].texto.replace(/^\s*>\s?/, ''));
        i++;
      }
      const texto = inl(cuerpo.join(' ').replace(/^\[!(\w+)\]\s*/, ''));
      if (texto) spec.push(['callout', texto, estiloDeCita(texto)]);
      continue;
    }

    // Tabla
    if (/^\s*\|/.test(t)) {
      const bloque = [];
      while (i < ls.length && !ls[i].codigo && /^\s*\|/.test(ls[i].texto)) bloque.push(ls[i++].texto);
      const f = filas(bloque).map((fila) => fila.map(inl));
      if (f.length >= 2) spec.push(['tabla', f]);
      else if (f.length === 1) spec.push(['parrafo', f[0].join(' · ')]);
      continue;
    }

    // Lista (con un nivel de anidado y código adentro de un ítem)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(t)) {
      let items = [];
      const cerrarLista = () => {
        for (let k = 0; k < items.length; k += 50) spec.push(['lista', items.slice(k, k + 50)]);
        items = [];
      };
      while (i < ls.length) {
        const li = ls[i];
        if (li.abre) {
          cerrarLista();
          i = codigo(i);
          continue;
        }
        if (vacia(li)) {
          // Una línea en blanco corta la lista salvo que siga otro ítem o algo sangrado.
          const sig = ls[i + 1];
          if (sig && !sig.codigo && /^\s*([-*+]|\d+[.)])\s+/.test(sig.texto)) {
            i++;
            continue;
          }
          if (sig && (sig.codigo || /^\s{2,}\S/.test(sig.texto))) {
            i++;
            continue;
          }
          break;
        }
        const m = li.texto.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) {
          if (li.codigo) break;
          // Continuación del ítem anterior (línea sangrada o pegada).
          if (/^\s+\S/.test(li.texto) || !empiezaBloque(li)) {
            const ultimo = spec.length && items.length === 0 ? spec[spec.length - 1] : null;
            if (items.length) items[items.length - 1] += ` ${li.texto.trim()}`;
            else if (ultimo && ultimo[0] === 'paso') ultimo[2] = `${ultimo[2]} ${li.texto.trim()}`;
            else break;
            i++;
            continue;
          }
          break;
        }
        const numerado = /\d/.test(m[2]);
        if (numerado && m[1].length < 2) {
          cerrarLista();
          spec.push(['paso', Number.parseInt(m[2], 10), m[3]]);
        } else {
          items.push(m[3]);
        }
        i++;
      }
      cerrarLista();
      // El inline de los pasos y los ítems se resuelve al final (pueden haber sumado líneas).
      continue;
    }

    // Párrafo
    const parrafo = [];
    while (i < ls.length && !vacia(ls[i]) && !(ls[i].codigo) && !(parrafo.length && empiezaBloque(ls[i]))) {
      parrafo.push(ls[i].texto.trim());
      i++;
    }
    if (parrafo.length) spec.push(['parrafo', inl(parrafo.join(' '))]);
    else i++;
  }

  // Inline de pasos e ítems de lista (se juntaron crudos para sumar las continuaciones).
  return spec.map((b) => {
    if (b[0] === 'paso') return ['paso', b[1], inl(b[2])];
    if (b[0] === 'lista') return ['lista', b[1].map(inl)];
    return b;
  });
}

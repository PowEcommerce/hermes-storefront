// ============================================================
// OpenAPI → páginas de referencia de Powbook (una por grupo/tag).
//
// Cada operación es un bloque ["api_operacion", {…}] que Powbook muestra como
// Redoc (workspace de documentación técnica): al centro la descripción, la
// autenticación, los parámetros, el cuerpo y las respuestas con su schema
// desplegable; a la derecha el método con la ruta y los ejemplos (armados desde
// el schema, como Redoc). Estático: no tiene «try it» ni le pega a la API.
// Los $ref se resuelven acá: Powbook recibe cada schema como árbol de campos.
// ============================================================
import { aSpec, inline } from './markdown.mjs';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

export function crearReferencia(doc, { resolver }) {
  const schemas = doc.components?.schemas ?? {};
  const seguridad = doc.components?.securitySchemes ?? {};

  const deref = (s, visto = new Set()) => {
    if (!s || typeof s !== 'object') return s ?? {};
    if (s.$ref) {
      const nombre = s.$ref.split('/').pop();
      if (visto.has(nombre)) return { type: 'object', 'x-ciclo': nombre };
      visto.add(nombre);
      return deref(schemas[nombre], visto);
    }
    if (s.allOf) {
      const partes = s.allOf.map((p) => deref(p, new Set(visto)));
      return {
        ...s,
        allOf: undefined,
        type: 'object',
        properties: Object.assign({}, ...partes.map((p) => p.properties ?? {}), s.properties ?? {}),
        required: [...new Set(partes.flatMap((p) => p.required ?? []).concat(s.required ?? []))],
      };
    }
    return s;
  };

  const unaLinea = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
  const celda = (t) => inline(unaLinea(t), resolver);
  const codigo = (t) => `\`${t.replace(/`/g, "'")}\``;

  /** Un ejemplo armado desde el schema (como el de Redoc): el `example` si hay, si no un valor de su tipo. */
  function ejemplo(s, prof = 0, visto = new Set()) {
    if (!s) return null;
    if (s.$ref) {
      const nombre = s.$ref.split('/').pop();
      if (visto.has(nombre) || prof > 6) return {};
      return ejemplo(schemas[nombre], prof, new Set([...visto, nombre]));
    }
    if (s.example !== undefined) return s.example;
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
    if (s.default !== undefined) return s.default;
    if (s.const !== undefined) return s.const;
    if (s.enum) return s.enum[0];
    const alt = s.oneOf ?? s.anyOf;
    if (alt) return ejemplo(alt.find((a) => a.type !== 'null') ?? alt[0], prof + 1, visto);
    if (s.allOf) return Object.assign({}, ...s.allOf.map((a) => ejemplo(a, prof + 1, visto) ?? {}));
    const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type;
    if (t === 'object' || s.properties) {
      const out = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = ejemplo(v, prof + 1, visto);
      return out;
    }
    if (t === 'array') return prof > 6 ? [] : [ejemplo(s.items, prof + 1, visto)];
    if (t === 'integer' || t === 'number') return s.minimum ?? 0;
    if (t === 'boolean') return true;
    if (t === 'string') {
      return (
        {
          'date-time': '2026-01-15T12:00:00Z',
          date: '2026-01-15',
          email: 'comprador@ejemplo.com',
          uri: 'https://www.ejemplo.com',
          url: 'https://www.ejemplo.com',
          uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          ipv4: '203.0.113.10',
        }[s.format] ?? 'string'
      );
    }
    return null;
  }

  const json = (v) => JSON.stringify(v, null, 2);

  // ───────────── api_operacion ─────────────

  const MAX_PROF = 8;
  const nombreRef = (s) => (s?.$ref ? s.$ref.split('/').pop() : null);
  const sinNull = (s) => {
    const alt = s?.oneOf ?? s?.anyOf;
    if (!alt) return s;
    const reales = alt.filter((a) => a.type !== 'null');
    return reales.length === 1 ? reales[0] : s;
  };
  const admiteNull = (s) =>
    !!(s?.nullable || (Array.isArray(s?.type) && s.type.includes('null')) || (s?.oneOf ?? s?.anyOf)?.some((a) => a.type === 'null'));

  /** El tipo como lo muestra Redoc, en castellano: `string <date-time>`, `Lista de objetos (CarritoLinea)`, `integer o null`. */
  function tipoRedoc(s0, prof = 0) {
    if (!s0) return 'any';
    const s = sinNull(s0);
    const nulo = admiteNull(s0) ? ' o null' : '';
    const ref = nombreRef(s);
    const d = deref(s);
    if (d.const !== undefined) return `valor: ${JSON.stringify(d.const)}${nulo}`;
    const alt = d.oneOf ?? d.anyOf;
    if (alt && prof < 3) return alt.map((a) => tipoRedoc(a, prof + 1)).join(' o ') + nulo;
    const t = Array.isArray(d.type) ? d.type.filter((x) => x !== 'null') : [d.type];
    if (t.includes('array') || d.items) {
      const it = d.items ?? {};
      const itRef = nombreRef(sinNull(it));
      const itD = deref(it);
      if (itD.properties || itD.type === 'object') return `Lista de objetos${itRef ? ` (${itRef})` : ''}${nulo}`;
      return `Lista de ${tipoRedoc(it, prof + 1)}${nulo}`;
    }
    if (d.properties || t.includes('object')) return `object${ref ? ` (${ref})` : ''}${nulo}`;
    let base = t.filter(Boolean).join(' o ') || 'any';
    if (d.format) base += ` <${d.format}>`;
    return base + nulo;
  }

  const md = (t) =>
    (t ?? '')
      .split('\n')
      .map((l) => {
        const m = l.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/);
        return m ? `${m[1].trim()} ${inline(m[2], resolver)}` : inline(l, resolver);
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const valorTexto = (v) => (v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v));
  const sinVacios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length)));

  /** El objeto (o el ítem de la lista) que tiene los campos de un schema, o null. */
  function objetoDe(s) {
    const d = deref(sinNull(s));
    if (d.properties) return d;
    if (d.items) return objetoDe(d.items);
    const alt = d.oneOf ?? d.anyOf;
    if (alt) {
      const conCampos = alt.map((a) => deref(a)).find((a) => a.properties);
      return conCampos ?? null;
    }
    return null;
  }

  /** Los campos de un schema como árbol (Redoc), cortando los ciclos de $ref. */
  function campos(s, visto = new Set(), prof = 0) {
    const o = objetoDe(s);
    if (!o) return [];
    const req = new Set(o.required ?? []);
    return Object.entries(o.properties ?? {}).map(([nombre, sub]) => {
      const d = deref(sinNull(sub));
      const refHijo = nombreRef(sinNull(sub)) ?? nombreRef(sinNull(d.items ?? {}));
      const ciclo = refHijo && visto.has(refHijo);
      const hijos = !ciclo && prof < MAX_PROF ? campos(sub, refHijo ? new Set([...visto, refHijo]) : visto, prof + 1) : [];
      return sinVacios({
        nombre,
        tipo: tipoRedoc(sub),
        requerido: req.has(nombre),
        descripcion: md(d.description ?? sub.description ?? ''),
        valores: (d.enum ?? (d.items ? deref(d.items).enum : undefined))?.map((v) => JSON.stringify(v)),
        defecto: valorTexto(d.default),
        ejemplo: d.example !== undefined && typeof d.example !== 'object' ? valorTexto(d.example) : undefined,
        hijos,
      });
    });
  }

  const schemaApi = (s) => sinVacios({ tipo: tipoRedoc(s), descripcion: md(deref(s).description ?? ''), campos: campos(s) });

  function ejemploDe(contenido) {
    if (!contenido) return undefined;
    const ej =
      contenido.example ??
      (contenido.examples ? Object.values(contenido.examples)[0]?.value : undefined) ??
      (contenido.schema ? ejemplo(contenido.schema) : undefined);
    if (ej === undefined || ej === null) return undefined;
    if (typeof ej === 'object' && !Array.isArray(ej) && !Object.keys(ej).length) return undefined;
    return json(ej);
  }

  function auth(op) {
    const reglas = op.security ?? doc.security;
    if (!reglas) return undefined;
    return reglas.map((r) =>
      Object.keys(r).map((k) => {
        const e = seguridad[k] ?? {};
        return sinVacios({
          nombre: k,
          en: e.in ?? (e.type === 'http' ? 'http' : undefined),
          clave: e.name ?? (e.scheme ? `Authorization: ${e.scheme}` : undefined),
          descripcion: md(e.description ?? ''),
        });
      }),
    );
  }

  /** Una operación → ["api_operacion", {…}] (la forma de lib/api-operacion.ts de Powbook). */
  function operacion(ruta, metodo, op) {
    const parametros = (op.parameters ?? []).map((p0) => {
      const p = p0.$ref ? deref(p0) : p0;
      const sch = deref(p.schema ?? {});
      return sinVacios({
        nombre: p.name,
        en: p.in,
        tipo: tipoRedoc(p.schema),
        requerido: !!p.required,
        descripcion: md(p.description ?? ''),
        valores: sch.enum?.map((v) => JSON.stringify(v)),
        defecto: valorTexto(sch.default),
        ejemplo: valorTexto(p.example ?? sch.example),
      });
    });
    const cuerpoCt = op.requestBody ? Object.keys(op.requestBody.content ?? {})[0] : null;
    const cuerpoC = cuerpoCt ? op.requestBody.content[cuerpoCt] : null;
    const respuestas = Object.entries(op.responses ?? {}).map(([codigoHttp, r0]) => {
      const r = r0.$ref ? deref(r0) : r0;
      const ct = Object.keys(r.content ?? {})[0];
      const c = ct ? r.content[ct] : null;
      return sinVacios({
        codigo: codigoHttp,
        descripcion: md(r.description ?? ''),
        contentType: ct,
        schema: c?.schema ? schemaApi(c.schema) : undefined,
        ejemplo: ejemploDe(c),
      });
    });
    const datos = sinVacios({
      metodo: metodo.toUpperCase(),
      path: ruta,
      resumen: unaLinea(op.summary) || `${metodo.toUpperCase()} ${ruta}`,
      descripcion: md(op.description ?? ''),
      deprecado: !!op.deprecated,
      auth: auth(op),
      parametros,
      cuerpo: cuerpoC
        ? sinVacios({
            requerido: !!op.requestBody.required,
            contentType: cuerpoCt,
            descripcion: md(op.requestBody.description ?? ''),
            schema: cuerpoC.schema ? schemaApi(cuerpoC.schema) : undefined,
            ejemplo: ejemploDe(cuerpoC),
          })
        : undefined,
      respuestas,
    });
    return ['api_operacion', datos];
  }

  // Operaciones por tag, en el orden de `tags` y de `paths`.
  const grupos = (doc.tags ?? []).map((t) => ({ nombre: t.name, descripcion: t.description ?? '', ops: [] }));
  const porNombre = new Map(grupos.map((g) => [g.nombre, g]));
  for (const [ruta, item] of Object.entries(doc.paths ?? {})) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (!op) continue;
      if (!op.parameters && item.parameters) op.parameters = item.parameters;
      for (const tag of op.tags ?? ['Otros']) {
        if (!porNombre.has(tag)) {
          const g = { nombre: tag, descripcion: '', ops: [] };
          grupos.push(g);
          porNombre.set(tag, g);
        }
        porNombre.get(tag).ops.push({ ruta, metodo, op });
      }
    }
  }

  return {
    grupos: grupos.filter((g) => g.ops.length),
    /** El spec de la página de un grupo. */
    pagina(g) {
      // Sin tabla índice: en Powbook las operaciones se listan en el sidebar, con su método.
      const spec = [];
      if (g.descripcion) spec.push(...aSpec(g.descripcion, { resolver }));
      for (const { ruta, metodo, op } of g.ops) spec.push(operacion(ruta, metodo, op));
      return spec;
    },
    /** La tabla de headers de autenticación (para la portada de la referencia). */
    tablaAutenticacion() {
      return [
        ['Header', 'Para qué'],
        ...Object.values(seguridad).map((s) => [codigo(s.name), celda(s.description)]),
      ];
    },
  };
}

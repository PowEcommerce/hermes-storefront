// ============================================================
// OpenAPI → páginas de referencia de Powbook (una por grupo/tag).
//
// Estático, como Redoc pero sin «try it»: por operación, el método y la ruta,
// la descripción, la autenticación, los parámetros, el cuerpo, las respuestas
// y un ejemplo de respuesta armado desde el schema (no se le pega a la API).
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

  /** El tipo de un schema, en una línea: `string (date-time)`, `Producto[]`, `"a" | "b"`. */
  function tipo(s, prof = 0) {
    if (!s) return '';
    if (s.$ref) return s.$ref.split('/').pop();
    if (prof > 3) return 'object';
    if (s.const !== undefined) return JSON.stringify(s.const);
    if (s.enum) {
      const v = s.enum.map((x) => JSON.stringify(x));
      return v.length > 6 ? `${v.slice(0, 6).join(' | ')} | …` : v.join(' | ');
    }
    const alternativas = s.oneOf ?? s.anyOf;
    if (alternativas) return alternativas.map((a) => tipo(a, prof + 1)).join(' | ');
    if (s.allOf) return s.allOf.map((a) => tipo(a, prof + 1)).join(' & ');
    let t = Array.isArray(s.type) ? s.type.join(' | ') : s.type;
    if (t === 'array' || (Array.isArray(s.type) && s.type.includes('array'))) {
      const item = tipo(s.items, prof + 1) || 'any';
      t = String(t).replace('array', `${/[ |&]/.test(item) ? `(${item})` : item}[]`);
    }
    if (!t) t = s.properties ? 'object' : 'any';
    if (s.format) t += ` (${s.format})`;
    if (s.nullable) t += ' | null';
    return t;
  }

  const unaLinea = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
  const celda = (t) => inline(unaLinea(t), resolver);
  const codigo = (t) => `\`${t.replace(/`/g, "'")}\``;

  /** Los campos de un objeto como filas de tabla (con un nivel de anidado: `padre.hijo`). */
  function campos(s, prefijo = '', prof = 0, filas = []) {
    const o = deref(s);
    const props = o.properties ?? {};
    const requeridos = new Set(o.required ?? []);
    for (const [nombre, sub] of Object.entries(props)) {
      const r = deref(sub);
      filas.push([
        codigo(prefijo + nombre),
        codigo(tipo(sub)),
        requeridos.has(nombre) ? 'sí' : '',
        celda(r.description ?? sub.description ?? ''),
      ]);
      if (prof < 1) {
        if (r.type === 'object' && r.properties) campos(r, `${prefijo}${nombre}.`, prof + 1, filas);
        const it = r.items ? deref(r.items) : null;
        if (it?.properties) campos(it, `${prefijo}${nombre}[].`, prof + 1, filas);
      }
    }
    return filas;
  }

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

  function autenticacion(op) {
    const reglas = op.security ?? doc.security;
    if (!reglas || !reglas.length) return null;
    if (reglas.every((r) => !Object.keys(r).length)) return 'Sin autenticación.';
    const alternativas = reglas
      .filter((r) => Object.keys(r).length)
      .map((r) =>
        Object.keys(r)
          .map((k) => codigo(seguridad[k]?.name ?? k))
          .join(' + '),
      );
    return `**Autenticación:** ${alternativas.join(' o ')}.`;
  }

  function operacion(ruta, metodo, op) {
    const spec = [];
    const titulo = unaLinea(op.summary) || `${metodo.toUpperCase()} ${ruta}`;
    spec.push(['titulo', `\`${metodo.toUpperCase()}\` ${titulo}`, {}]);
    spec.push(['parrafo', `\`${metodo.toUpperCase()} ${ruta}\``]);
    if (op.deprecated) spec.push(['callout', '**Deprecado.** Va a dejar de existir: no lo uses en un storefront nuevo.', 'warning']);
    if (op.description) spec.push(...aSpec(op.description, { resolver }));
    const auth = autenticacion(op);
    if (auth) spec.push(['parrafo', auth]);

    const params = op.parameters ?? [];
    if (params.length) {
      spec.push(['titulo3', 'Parámetros']);
      spec.push([
        'tabla',
        [
          ['Nombre', 'En', 'Tipo', 'Requerido', 'Descripción'],
          ...params.map((p0) => {
            const p = p0.$ref ? deref(p0) : p0;
            return [codigo(p.name), p.in, codigo(tipo(p.schema)), p.required ? 'sí' : '', celda(p.description)];
          }),
        ],
      ]);
    }

    const cuerpo = op.requestBody?.content?.['application/json']?.schema;
    if (cuerpo) {
      spec.push(['titulo3', `Cuerpo${op.requestBody.required ? '' : ' (opcional)'}`]);
      const filas = campos(cuerpo);
      if (filas.length) spec.push(['tabla', [['Campo', 'Tipo', 'Requerido', 'Descripción'], ...filas]]);
      const ej = op.requestBody.content['application/json'].example ?? ejemplo(cuerpo);
      if (ej && (typeof ej !== 'object' || Object.keys(ej).length)) spec.push(['codigo', json(ej), 'json']);
    }

    const respuestas = Object.entries(op.responses ?? {});
    if (respuestas.length) {
      spec.push(['titulo3', 'Respuestas']);
      spec.push([
        'tabla',
        [
          ['Código', 'Descripción', 'Cuerpo'],
          ...respuestas.map(([codigoHttp, r]) => {
            const s = r.content?.['application/json']?.schema;
            return [codigo(codigoHttp), celda(r.description), s ? codigo(tipo(s)) : ''];
          }),
        ],
      ]);
      const ok = respuestas.find(([c]) => /^2/.test(c));
      const s = ok?.[1]?.content?.['application/json'];
      if (s?.schema || s?.example) {
        const ej = s.example ?? ejemplo(s.schema);
        if (ej !== null && ej !== undefined) {
          spec.push(['parrafo', `**Ejemplo de respuesta ${ok[0]}** (armado desde el schema):`]);
          spec.push(['codigo', json(ej), 'json']);
        }
      }
    }
    return spec;
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
      const spec = [];
      if (g.descripcion) spec.push(...aSpec(g.descripcion, { resolver }));
      spec.push([
        'tabla',
        [['Método', 'Ruta', 'Qué hace'], ...g.ops.map(({ ruta, metodo, op }) => [codigo(metodo.toUpperCase()), codigo(ruta), celda(op.summary)])],
      ]);
      for (const { ruta, metodo, op } of g.ops) spec.push(...operacion(ruta, metodo, op));
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

# La documentación en Powbook

La misma documentación del sitio (`site/`, VitePress) se publica también en
**Powbook** ([powbook.pow.la](https://powbook.pow.la)), en el workspace
`storefront-hermes`. Las páginas no se escriben a mano: salen de los mismos
archivos que el sitio, así que cuando cambia la doc se vuelven a generar y a
publicar.

| Fuente | Página en Powbook |
|---|---|
| `site/index.md` (hero, tarjetas y los 6 comandos) | Inicio |
| `docs/guia-agencias.md`, hasta el quickstart de la API | Guías › Guía para agencias, Dominios propios, Remitente de mails, Trabajo en equipo y CI |
| `docs/cli.md` | Guías › La CLI |
| `packages/cli/README.md` | Guías › Comandos de la CLI |
| `docs/guia-agencias.md`, del quickstart de la API en adelante | Storefront API › una página por sección (Tokens, Catálogo, Carrito…) |
| `packages/storefront/openapi.yaml` | Referencia de la API › una página por grupo (Config, Catálogo, Carrito…) |
| `packages/storefront/README.md` | SDK |
| `packages/storefront/examples/next-app-router` | SDK › Ejemplo: Next.js |
| `packages/create-store/README.md` | SDK › create-store |

## Generar

```bash
node scripts/powbook/generar.mjs
```

Deja en `scripts/powbook/salida/` (ignorada por git) un JSON por página con
`{ workspace, ruta, spec }` y un `indice.json` con el orden de publicación. No
toca Powbook. Necesita las dependencias del SDK instaladas (`npm ci` en
`packages/storefront`: usa su `js-yaml` para leer la OpenAPI).

Opciones: `--salida <carpeta>` y `--workspace <slug>` (por defecto
`storefront-hermes`).

El script frena si una página no entra en los límites de `publish_page`
(400 bloques, 4000 caracteres por párrafo, tablas de hasta 200 filas y 10
columnas) o si la guía cambió de forma que ya no se puede partir (renombraron
«Tu dominio», «Los mails de la marca», «Trabajar en equipo» o el
«Quickstart (10 minutos)»): en ese caso hay que ajustar `generar.mjs`.

## Qué hace con el Markdown

- **Títulos:** el `#` es el título de la página; `##` → título, `###` y más →
  subtítulo. Las secciones de la guía que quedan como página propia pierden su
  propio título.
- **Código, tablas y listas** pasan tal cual (con un nivel de anidado; los
  subítems quedan como ítems). Una lista numerada queda como pasos. Una tabla
  sangrada dentro de un ítem o un paso sale como bloque de tabla propio después
  del ítem (Powbook no anida bloques en una lista), y el texto que la sigue en
  ese ítem queda como párrafo.
- **Avisos:** una cita (`> **Ojo:** …`) es un aviso: `warning` si empieza con
  Ojo, Atención, Importante o Limitación; `success` con Tip; si no, `info`. Los
  contenedores de VitePress (`::: warning Título`) también.
- **Links:** un link a un archivo del repo que tiene página en Powbook va a esa
  página (`/storefront-hermes/guias/la-cli`), y uno a una sección de la guía va
  a la página y al título donde quedó (`…/guias/dominios-propios`,
  `…/storefront-api/webhooks#verificar-la-firma`). Vale también para los links
  absolutos a GitHub (`…/blob/main/docs/guia-agencias.md#trabajar-en-equipo`,
  los de los README que se leen en npm). Si el texto del link es un path
  (`cli.md`, `packages/storefront/openapi.yaml`), pasa a ser el título de la
  página. Lo demás va a GitHub.
  Powbook lleva esos links a la vista pública cuando se leen sin login.
- **Referencia de la API:** por operación, el método y la ruta, la
  descripción, la autenticación, los parámetros, el cuerpo, las respuestas y un
  ejemplo de respuesta armado desde el schema. Es estática: no tiene «try it» ni
  le pega a la API.

## Publicar

Se publica con el conector **Powbook** de Claude (`publish_page`), página por
página y en el orden de `indice.json` (las secciones antes que sus páginas).
Hace falta ser editor del workspace y que el conector acepte los bloques
`codigo`, `tabla` y `tarjetas`.

1. Generar las páginas (arriba).
2. Pedirle a Claude que publique `scripts/powbook/salida/` en Powbook: por cada
   página llama `publish_page` **sin** `confirm`, con `workspace`, `ruta` y
   `spec` del JSON, y muestra la vista previa (crear o reemplazar, y la página
   en Markdown).
3. Revisar las vistas previas y dar el OK. Recién ahí se repite cada llamada con
   `confirm: true`.
4. Abrir el workspace en Powbook y revisar que se vea bien.

`publish_page` reemplaza la página entera: no edites a mano en Powbook las
páginas que salen de acá, porque la próxima publicación pisa esos cambios.
Lo que haya que corregir, se corrige en el `.md` del repo.

Para que las agencias la lean **sin login**, el workspace tiene que ser
público: en Powbook, el workspace → Configuración → Visibilidad → **Hacer
público**. El link queda `https://powbook.pow.la/public/storefront-hermes`.

## Antes de commitear

Este repo es público. Si tocás el script o el contenido:

```bash
scripts/tarball-sin-internos.sh --arbol
gitleaks detect --no-banner
```

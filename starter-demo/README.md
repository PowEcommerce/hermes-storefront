# Tienda demo de Hermes

Tienda headless **con diseño completo** sobre la **Storefront API de Hermes**:
Next.js 16 (App Router), TypeScript, Tailwind 4, CSS modules y el SDK
[`@hermesecommerce/storefront`](https://github.com/PowEcommerce/hermes-storefront/tree/main/packages/storefront).
Es el equivalente a la *demo store* de Shopify Hydrogen: arrancás con algo
lindo y vendible, con los datos y la marca de tu tienda, y lo vas cambiando.
Si preferís arrancar de cero, el template **skeleton**
(`hermes create mi-tienda --template skeleton`) trae la misma lógica sin diseño.

El diseño sale de una tienda real de Pow hecha sobre Hermes, adaptado para que
funcione **sólo con el SDK público**: header transparente sobre el hero que se
vuelve blanco al scrollear, mega-menú con las fotos de las categorías, menú de
celular a pantalla completa, buscador que baja desde arriba, tarjetas 3:4 con
segunda foto en hover y cucardas de texto, PLP con barra pegada, panel lateral
de filtros y «Ordenar», ficha con galería en grilla y columna de compra
sticky, carruseles de productos con flechas y footer con marquee y el nombre
de la marca a lo ancho.

## De cero a la tienda andando

```bash
npm install -g @hermesecommerce/cli    # 1. una sola vez por máquina (como `@shopify/cli`)
hermes create mi-marca                 # 2. = npm create @hermesecommerce/store mi-marca
cd mi-marca                            # 3.
hermes login                           # 4. tu usuario del backoffice (una vez por máquina)
hermes link                            # 5. elegís la marca → tokens HERMES_* en .env
hermes dev                             # 6. http://localhost:3000 con los datos de la marca
hermes deploy                          # 7. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 8. tu dominio (o desde el admin: Configuración → Dominios)
```

Con **Node 22 LTS** (o 20/24; `engines` del `package.json`). Con otra versión
(p. ej. 23) la instalación tira `EBADENGINE` de vitest/eslint; la CLI avisa.

La tienda trae la CLI como devDependency (como el template de Hydrogen trae
`@shopify/cli`): la versión queda fija por proyecto y el CI la usa sin
instalar nada. Si tu `hermes` global es de otra versión, avisa y corre la del
proyecto. **Sin instalar nada global** también anda: `npm create
@hermesecommerce/store mi-marca` y, dentro de la tienda, `npm run hermes -- login`,
`npm run hermes -- link`, `npm run dev`, `npm run deploy` y `npm run hermes -- domains add …`.
Fuera de un proyecto: `npx --prefer-online @hermesecommerce/cli@latest <comando>` (con un rango como `@^0`, npx reusa la copia vieja que tenga en caché; `--prefer-online` + `` lo obliga a preguntarle a npm), o instalala global con `npm i -g @hermesecommerce/cli@latest`.

> **Ojo:** El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero.
> Nunca uses `npx hermes`.

Si al crear la tienda ya tenés la CLI logueada, el generador te ofrece correr
`hermes link` ahí mismo.

- `hermes dev [--port 3000] [--open]` (o `npm run dev`) verifica que la
  carpeta esté linkeada y que los tokens del `.env` sigan vigentes, instala
  dependencias si faltan y levanta `next dev` (el script `dev:next`) con las
  `HERMES_*` inyectadas. Muestra la URL local, la marca, el entorno
  (producción u otra API) y links a la home, una categoría y el carrito.
- `hermes preview [--port]` (o `npm run preview`) hace el build de producción
  y lo sirve en local (`npm run build` + `npm run start`) con las mismas
  verificaciones.
- `hermes deploy` (o `npm run deploy`) buildea con @opennextjs/cloudflare
  (que corre `npm run build`) y lo publica en el hosting de Hermes.

### Scripts

| Script | Qué corre |
|---|---|
| `dev` | `hermes dev` (verifica link y tokens y levanta `dev:next`) |
| `dev:next` | `next dev` crudo (Next lee el `.env`; sin verificaciones) |
| `build` / `start` | `next build` / `next start` (los usan `hermes preview` y `hermes deploy`) |
| `preview` | `hermes preview` |
| `deploy` | `hermes deploy` |
| `lint`, `typecheck`, `test` | ESLint, tipos, vitest |

`dev`, `preview` y `deploy` son la CLI; no los cambies por `hermes …` en
`dev:next`, `build` o `start` (la CLI corta con un error si un script la
llama en bucle).

**Otro hosting.** Si no usás el hosting de Hermes, cualquier hosting de
Next.js (Vercel, Cloudflare con OpenNext, un server Node): cargá las mismas
`HERMES_*` del `.env` en las variables del proyecto y apuntá el dominio de
la tienda ahí; el checkout hosteado de la marca queda en
`checkout.<tu-dominio>` (lo sirve Hermes; pedile a Pow que lo configure). Linkeá con
`hermes link --domain tu-dominio.com` para que el checkout pueda volver a tu
sitio, y con `--revalidate-url https://tu-dominio.com/api/hermes/revalidate`
para que los cambios del backoffice purguen la caché al instante.

## Variables

Las escribe `hermes link` en `.env` (ver [`.env.example`](./.env.example)):

| Variable | Para qué |
|---|---|
| `HERMES_TENANT` | la marca (`X-Client-ID`) |
| `HERMES_API_URL` | la API (`https://api.pow.la/api`) |
| `HERMES_PUBLIC_TOKEN` | `pst_…`: catálogo, carrito, cuenta, crear la checkout session |
| `HERMES_PRIVATE_TOKEN` | `psk_…`, **sólo servidor**: leer el estado del pago en `/checkout/vuelta` |
| `HERMES_REVALIDATE_SECRET` | `whsec_…` del webhook `storefront/revalidate` (purga de caché) |
| `HERMES_BRAND_HOSTS` (opcional) | dominios del sitio actual de la marca, separados por coma (`www.mimarca.com.ar,mimarca.com.ar`): los links de los bloques del backoffice que apuntan ahí se abren dentro de esta tienda |
| `SITE_URL` (opcional) | URL pública (https) para el `return_url`/`cancel_url` del checkout; si no está, se arma con el host del pedido. En local no se usa (ver *Checkout hosteado*) |
| `HERMES_CSP_IMG_HOSTS`, `HERMES_CSP_CONNECT_HOSTS`, `HERMES_CSP_ENFORCE` (opcionales) | hosts extra de la CSP y pasarla de Report-Only a obligatoria (ver *Headers de seguridad*). Se leen en el build |

## Qué trae

| Ruta | Qué hace | Render |
|---|---|---|
| `/` | Los **page blocks** de la home (`content.home()`); si la marca no tiene ninguno, banner de la marca + destacados (`catalog.products`) | estático + ISR (tags `home-page-blocks`, `products`…) |
| `/pages/[slug]` | Landings del backoffice (`content.landing(slug)`), la misma URL que usan las marcas | prerender de las publicadas + ISR (tags `landings`, `landing-<slug>`) |
| `/categoria/[slug]` | PLP con filtros de `catalog.filters` (color, talle, propiedades), orden y paginación en la URL | dinámico, datos cacheados por tags |
| `/producto/[slug]` | PDP: fotos, precio, color (`?color=`), talle con stock, cantidad, agregar al carrito, solapas; reseñas si la app está prendida (`settings/integrations`) | dinámico, datos cacheados por tags |
| `/buscar?q=` | Búsqueda (`catalog.search`), respeta las redirecciones del backoffice | dinámico |
| `/carrito` | Líneas con +/−/quitar, cupón, totales, envío gratis, **Finalizar compra** | sin caché |
| `/checkout/vuelta` | Estado real del pago con el `psk_` (éxito / pendiente / fallido) | sin caché |
| `/cuenta`, `/cuenta/ingresar`, `/cuenta/registro` | Login, registro, logout y mis pedidos | sin caché |
| `/api/hermes/revalidate` | Webhook `storefront/revalidate` (`createRevalidateRoute`) | — |
| `/api/cuenta/refresh` | Renueva la sesión del comprador (refresh rotativo) | — |
| `/api/carrito/resumen` | Cantidad para el badge del header | — |

### Page blocks (home y landings)

Lo que la marca arma en el backoffice (Contenido → Home / Landings) se dibuja
con [`components/blocks/PageBlocks.tsx`](./components/blocks/PageBlocks.tsx):

- **Tipos soportados:** `Banner`, `BannerButton`, `RichText`, `Carousel`,
  `SkuCarousel` (con solapas) y `Video` (mp4 o YouTube/Vimeo): el 98% de los
  bloques activos de las marcas. Un tipo sin componente no se dibuja; en
  desarrollo aparece un recuadro punteado y un `console.warn`. Para sumar o
  pisar uno: `<PageBlocks components={{ 'PageBlock::ShopTheLook': MiShop }} />`.
- **Layout:** cada sección es una fila de una grilla de 12 columnas; el ancho
  de cada bloque sale de `bootstrap_class {xs, md}` (`normalizePageBlocks` del SDK).
- **Productos de los carruseles:** se juntan los SKUs de TODOS los
  `SkuCarousel` de la página en un solo `catalog.bySkus()` (tag `products`) y
  cada bloque se queda con los suyos ([`lib/content.ts`](./lib/content.ts)).
  Las tarjetas son las mismas de la PLP.
- **RichText:** el HTML del backoffice se **sanitiza en el servidor**
  ([`lib/sanitize.ts`](./lib/sanitize.ts), `sanitize-html` con lista blanca:
  sin `<script>`, `on*`, `style`; iframes sólo de YouTube/Vimeo).
- **Imágenes:** originales del CDN de la marca con `<img>`/`<picture>`
  (arte mobile hasta 767px), sin optimizador (sin costo de transformación).
  Sólo el primer bloque carga con prioridad; el resto, lazy.
- **Links:** `resolveHref` ([`lib/links.ts`](./lib/links.ts)) pasa los links
  absolutos al dominio de la marca (`HERMES_BRAND_HOSTS`) a rutas de la
  tienda, agrega `https://` a los que vienen sin esquema y lleva
  `/categorias/x` → `/categoria/x`, `/productos/x` → `/producto/x`. Además,
  `next.config.ts` tiene **rewrites** de `/categorias/:slug` y
  `/productos/:slug/*` a las rutas de la tienda, así cualquier link viejo (de
  un mail, de Google) también anda. Si preferís las URLs de la marca,
  renombrá las carpetas `app/categoria` → `app/categorias` y
  `app/producto` → `app/productos` y cambiá `ROUTES` en `lib/links.ts`.
- **Caché:** home con tag `home-page-blocks` (60 s), landings con `landings`
  + `landing-<slug>`; Hermes los purga al guardar y `/api/hermes/revalidate`
  los recibe como cualquier otro tag.
- **Home de ejemplo:** si la marca todavía no cargó bloques, `/` muestra una
  home armada con su nombre, destacados y categorías. En `hermes dev` lleva
  un aviso («Esta es la home de ejemplo: cargá la tuya desde el admin
  (Contenido › Página de inicio)»); en producción, no.

### Vista previa del editor de inicio (`/home/preview`)

El editor de inicio del admin de Hermes abre en un iframe
`<tu tienda>/home/preview?pb_type=Main%20Store[&home_version_token=…]&t=…`.
[`app/home/preview/page.tsx`](./app/home/preview/page.tsx) dibuja los mismos
bloques que la home (`PageBlocks`) para ese `pb_type` (`Main Store`,
`OUTLET`…), con estas diferencias:

- **Dinámica y sin caché** (`force-dynamic`, `no-store`): lo que se acaba de
  guardar se ve en el próximo reload del iframe.
- Con **`home_version_token`**, la versión en borrador (`content.home({
  homeVersionToken })` del SDK) y un cartel arriba: «Vista previa: <versión> ·
  no es lo que ven los clientes». Con un token vencido, la home publicada.
- **`noindex`** (metadata y `X-Robots-Tag`).
- Habla con el editor por `postMessage` ([`components/blocks/PuenteDelEditor.tsx`](./components/blocks/PuenteDelEditor.tsx)):
  resalta el bloque que elegís en el admin y le avisa cuál tocás en la vista
  previa.
- Es la **única ruta embebible**, y sólo desde `https://hermes.pow.la` y
  `https://admin.pow.la` (ver abajo).

Si renombrás o movés la home, mantené esta ruta: es la URL que usa el admin.

### Cómo está armado

- **Server Components por defecto.** Los únicos client components son los
  interactivos: `AddToCart`, `CartLine`, `CouponForm`, `CartBadge`, los forms
  de la cuenta.
- **Un solo cliente del SDK** en [`lib/hermes.ts`](./lib/hermes.ts), creado con
  `@hermesecommerce/storefront/next` (cada GET sale con `next: { tags, revalidate }`
  de la spec) y marcado con `import 'server-only'`: el `psk_` no puede llegar
  al navegador (el build falla si un client component lo importa).
- **Caché e ISR.** Los datos del catálogo se cachean con los tags de Hermes
  (`product-<slug>`, `category-<slug>`, `products`, `settings`…) y el TTL de
  la spec como red de seguridad (60 s / 1 h). Cuando algo cambia en el
  backoffice, Hermes llama a `/api/hermes/revalidate` y se purgan esos tags.
  Carrito, cuenta y checkout nunca se cachean.
- **Comprador en cookies httpOnly** ([`lib/cookies.ts`](./lib/cookies.ts)):
  `hermes_cart` (token `crt_`, 30 días), `hermes_customer` (access, 15 min) y
  `hermes_customer_refresh`. El navegador nunca ve los tokens; todo pasa por
  Server Actions ([`app/carrito/actions.ts`](./app/carrito/actions.ts),
  [`app/cuenta/actions.ts`](./app/cuenta/actions.ts)).
- **Checkout hosteado.** "Finalizar compra" es una Server Action
  ([`app/checkout/actions.ts`](./app/checkout/actions.ts)) que crea la
  checkout session con `return_url = <sitio>/checkout/vuelta` y
  `cancel_url = <sitio>/carrito` y redirige. La vuelta lee la sesión con el
  token privado: **nunca** confíes en la query.
  **En desarrollo la vuelta va al dominio de la marca, como en Hydrogen**:
  si el sitio es `localhost`/`127.0.0.1` o no es https, la action NO manda
  `return_url`/`cancel_url` (la API sólo acepta https en los dominios del
  token); el checkout hosteado muestra su propia confirmación y "Volver a la
  tienda" lleva al sitio de la marca. Para probar la vuelta a tu tienda,
  usá un dominio https cargado en el token (`hermes link --domain …`).
- **Precios.** Todos se formatean en la tienda con `formatearPrecio`
  ([`lib/precios.ts`](./lib/precios.ts), `Intl` `es-AR`/ARS) a partir de los
  campos numéricos (`non_formatted_price`, `*_cents`…), no de los textos ya
  formateados de la API (algunas marcas los reciben con el formato de su
  tienda anterior). En la ficha cada talle tiene su precio (la oferta puede
  ser de una sola variante): sin talle elegido se ve el precio común o
  "Desde $X".
- **Look & feel de la marca.** [`lib/brand.ts`](./lib/brand.ts) toma de
  `storefront/config` el nombre, el logo, la fuente y los tokens de color del
  checkout (`--checkout-cta`, `--checkout-negro`, `--checkout-fondo`…) y los
  pone como variables `--brand-*` en el `<html>`; Tailwind las expone como
  `bg-primary`, `text-fg`, `border-border`, `rounded-brand`, `font-sans`…
  ([`app/globals.css`](./app/globals.css)). Cambiá el mapeo o pisalas con los
  colores de tu diseño.
- **Errores.** Todo lo que falla en la API llega como `HermesApiError`
  (`status`, `code`, `message`); [`lib/errors.ts`](./lib/errors.ts) lo pasa a
  un mensaje para el comprador (nunca HTML ni textos técnicos; el detalle va
  al log del server con `detalleDeError`). Por la URL (`/carrito?error=…`)
  viaja sólo un código que la página traduce. Un 404 de producto/categoría
  va a `not-found`.
- **Favicon.** [`app/icon.svg`](./app/icon.svg) es genérico: reemplazalo por
  el de tu marca.

## El diseño (UI kit)

Todo el look sale de los tokens de [`app/globals.css`](./app/globals.css):

- **Colores de la marca.** [`lib/brand.ts`](./lib/brand.ts) lee
  `storefront/config` (nombre, logo, fuente y los tokens de color del checkout
  hosteado) y los pone como `--brand-*` en el `<html>`; `globals.css` los
  traduce a los tokens del kit (`--ui-negro`, `--ui-blanco`, `--ui-primario`,
  `--ui-tinta-2`, `--ui-gris-100`, `--ui-gris-700`, `--ui-radio`…). Sin config
  (o con la API caída) va una paleta neutra: tinta casi negra, grises y radio 2.
  El color de oferta (`--ui-oferta`, naranja) es del tema: cambialo por el de tu marca.
- **Logo y nombre.** El header muestra el logo de la marca si `storefront/config`
  trae una URL absoluta; si no, su nombre. El footer repite el nombre a lo ancho.
- **Tipografía.** [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk)
  con `next/font/google` (se baja en el build y se sirve desde la tienda). Si
  la marca tiene fuente propia en `storefront/config`, gana esa. Escala:
  `.ui-t-display` (64/600), `.ui-t-h1` (40/500), `.ui-t-h2` (32/500),
  `.ui-t-titulo` (24/400), `.ui-t-nombre` (20/500), `.ui-t-cuerpo` (16/400),
  `.ui-t-chico` (12/400). Nada por debajo de 12; los campos van en 16 (iOS no hace zoom).
- **Piezas.** `.ui-boton` (48, borde 2; hover con un anillo interior de 3 px),
  `--secundario`, `--blanco` y `--chico`; `.ui-campo`; `.ui-enlace`. Los
  nombres del skeleton (`.btn`, `.btn-outline`, `.input`) apuntan a lo mismo.
- **Hero.** La primera sección de la home, si es de imagen (Banner,
  BannerButton, Carousel o Video a ancho completo), sube debajo del header,
  que va transparente encima (en blanco, o en negro si la marca eligió
  `text_color: dark` para el menú en el backoffice). Lo decide el CSS
  (`body:has([data-hero])`), sin saltos al hidratar.
- **Páginas estáticas.** Las del backoffice (envíos, cambios, términos) se
  sirven en `/info/<path>` con el HTML sanitizado, y el footer las lista.

| Carpeta | Qué hay |
|---|---|
| `components/header/` | header, mega-menú, menú de celular, buscador |
| `components/blocks/` | page blocks (hero, banners, carruseles, texto, video) |
| `components/plp/` | barra de la PLP, panel de filtros |
| `components/producto/` | galería y estilos de la ficha |
| `components/ProductCard.tsx` | la tarjeta (PLP, búsqueda, carruseles, relacionados) |
| `components/Footer.tsx` | footer |

## Licencias de lo que trae

| Qué | De dónde | Licencia |
|---|---|---|
| Código de la tienda | este repo | MIT |
| Tipografía Schibsted Grotesk | Google Fonts, vía `next/font/google` | SIL Open Font License 1.1 |
| Íconos | [Lucide](https://lucide.dev) (`lucide-react`) | ISC |
| Fotos, logos, textos | los de **tu marca**, desde la API | — |

La demo no trae imágenes, logos ni íconos propios de Pow: los íconos
dibujados a mano de la tienda original se cambiaron por los de Lucide, el
logo y el nombre salen de `storefront/config`, y el 404 es una franja en el
color de la marca en vez de una foto.

## Headers de seguridad

`next.config.ts` aplica a todas las rutas los headers de
[`lib/security-headers.ts`](lib/security-headers.ts):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN` (la tienda no se deja embeber en un iframe
  ajeno), salvo en `/home/preview`: ahí no va, y en su lugar sale una
  `Content-Security-Policy: frame-ancestors 'self' https://hermes.pow.la
  https://admin.pow.la` **obligatoria** (aunque el resto de la CSP siga en
  Report-Only), para que sólo el admin de Hermes la pueda embeber
  (`reglasDeHeaders()` en `lib/security-headers.ts`)
- una **Content-Security-Policy en modo `Report-Only`**: el navegador avisa
  en la consola lo que bloquearía, pero no bloquea nada.

La CSP sale en Report-Only porque una estricta puede romper la tienda: las
imágenes que carga la marca en el backoffice pueden venir de hosts que no
conocemos de antemano y el checkout hosteado vive en el dominio de cada
marca. Ya permite Next (scripts y estilos inline; en `dev` además `eval` y el
websocket del HMR), Mercado Pago (`*.mercadopago.com`, `*.mlstatic.com`), los
CDN de imágenes (`*.powcdn.com`, `*.hermescdn.app`), la API (`api.pow.la` y
la de `HERMES_API_URL`) y los videos de YouTube/Vimeo de los bloques.

Para pasarla a obligatoria:

1. Navegá la tienda (home, PLP, PDP, carrito, checkout, cuenta) con la
   consola abierta y buscá avisos `Content-Security-Policy-Report-Only`.
2. Sumá los hosts que falten por env, separados por coma:
   `HERMES_CSP_IMG_HOSTS` (imágenes) y `HERMES_CSP_CONNECT_HOSTS` (`fetch`
   desde el navegador). Si agregás scripts de terceros (analytics, chat),
   sumalos en `lib/security-headers.ts`.
3. Con la consola limpia, `HERMES_CSP_ENFORCE=1` la manda como
   `Content-Security-Policy`.

Los headers se calculan en el build (`next build`): estas variables tienen
que estar en el entorno del build, no sólo en el runtime.

El HTML del backoffice (bloques RichText, solapas de la PDP) se sanitiza en
el servidor antes de dibujarlo ([`lib/sanitize.ts`](lib/sanitize.ts)), con o
sin CSP.

## Qué no trae (todavía)

Respecto de la tienda original quedaron afuera, porque dependen de cosas que
no están en la API pública o de la plataforma de Pow: favoritos y listas
compartidas, newsletter y popups, ruleta de premios, contador del header,
contacto, cuotas y precio sin impuestos en la tarjeta, guía de talles, aviso
de reposición, cucardas de imagen, carrito en panel lateral (acá es una
página) y las animaciones de entrada con JavaScript.


Checkout propio (se usa el hosteado de la marca), direcciones y perfil del
comprador, login con Google o por código, wishlist, alta de reseñas, home
armada desde el backoffice (`/v2/home` / landings), multi-idioma, sitemap.
Todo está en el SDK (`hermes.account.*`, `hermes.reviews.*`, `hermes.api.GET(...)`)
y en la [guía para agencias](https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/guia-agencias.md).

## Deploy desde CI y en equipo

`.hermes/project.json` (marca y proyecto, sin secretos) va commiteado; cada
developer corre `hermes link` y tiene sus propios tokens de desarrollo en su
`.env`. La tienda publicada usa los tokens del proyecto, que maneja Hermes.

Para deployar desde CI, un admin de la marca crea un token de deploy
(`hermes deploy-token create`) y lo carga como secreto
`HERMES_DEPLOY_TOKEN`: con esa variable, `npm run hermes -- deploy --yes` no
necesita login. Ejemplo para GitHub Actions (producción al pushear a `main`,
preview por PR):

```yaml
# .github/workflows/hermes.yml
name: Hermes
on:
  push: { branches: [main] }
  pull_request:
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      HERMES_DEPLOY_TOKEN: ${{ secrets.HERMES_DEPLOY_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - if: github.event_name == 'push'
        run: npm run hermes -- deploy --yes
      - if: github.event_name == 'pull_request'
        run: npm run hermes -- deploy --preview --branch "${{ github.head_ref }}" --yes
```

Con borrado de la preview al cerrar el PR y más detalles: [guía para
agencias, «Trabajar en equipo»](https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/guia-agencias.md#trabajar-en-equipo).

## Dentro del repo de Hermes

La demo vive en [`starter-demo/`](https://github.com/PowEcommerce/hermes-storefront/tree/main/starter-demo) del repo
`PowEcommerce/hermes-storefront` y usa el SDK y la CLI locales
(`"@hermesecommerce/storefront": "file:../packages/storefront"` y
`"@hermesecommerce/cli": "file:../packages/cli"`, instalados como copia por el
`.npmrc`). Una tienda creada con `npm create @hermesecommerce/store` usa las
versiones publicadas en npm (`^<versión>`) y no trae ese `.npmrc`.

```bash
cd packages/storefront && npm ci && npm run build  # la demo usa el dist/
cd ../cli && npm ci && npm run build               # el bin `hermes` de los scripts
cd ../../starter-demo && npm ci
HERMES_TENANT=tu-marca npm run build              # con los tokens de `hermes link` en .env
npm run typecheck && npm run lint && npm test
```

Si cambiás el SDK o la CLI: `npm run build` en `packages/storefront` o
`packages/cli` y `rm -rf node_modules/@hermesecommerce && npm install` acá.
CI: `.github/workflows/ci.yml`.

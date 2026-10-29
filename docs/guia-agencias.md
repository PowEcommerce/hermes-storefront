# Guía para agencias: storefront headless sobre Pow

Esta guía es para equipos que construyen el storefront de una marca de Pow con
su propio front (Next.js, Hydrogen-style, Astro, una app móvil…) sobre nuestra
API. Pow pone el catálogo, el carrito, la cuenta del comprador, el checkout y
los pagos; vos ponés la experiencia.

- **Referencia completa (OpenAPI 3.1):** `GET https://api.pow.la/api/v2/openapi.json`
  (o `.yaml`). También está en este repo:
  [`packages/storefront/openapi.yaml`](../packages/storefront/openapi.yaml). Abrila con lo que uses (Redocly, Scalar,
  Swagger UI, Postman, Insomnia) o generá un cliente tipado
  (`npx openapi-typescript https://api.pow.la/api/v2/openapi.json -o pow.d.ts`).
- **SDK TypeScript:** [`@hermesecommerce/storefront`](../packages/storefront) — cliente tipado (Node 18+, Workers,
  Edge, navegador), errores normalizados, `verifyWebhook` y caché por tags
  con purga (`@hermesecommerce/storefront/next` para Next.js).
- **Base URL:** `https://api.pow.la/api`.

---

## Quickstart con el starter (5 minutos)

La forma más rápida: una tienda Next.js completa (home, categorías con filtros,
ficha con talles y stock, búsqueda, carrito con cupón, checkout hosteado,
cuenta del comprador y purga de caché) que ya se ve con los colores y la
fuente de la marca. Es el equivalente al "Skeleton" de Shopify Hydrogen:
[`starter/`](../starter).

```bash
npm install -g @hermesecommerce/cli    # 1. una sola vez por máquina (como `@shopify/cli`)
hermes create mi-marca                 # 2. = npm create @hermesecommerce/store mi-marca
cd mi-marca                            # 3.
hermes login                           # 4. tu usuario del backoffice (una vez por máquina)
hermes link                            # 5. elegís la marca → su proyecto + tokens HERMES_* en .env
hermes dev                             # 6. http://localhost:3000 con los datos de la marca
hermes deploy                          # 7. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 8. tu dominio (o desde el admin: Configuración → Dominios)
```

La tienda trae la CLI como devDependency (como el template de Hydrogen trae
`@shopify/cli`): la versión queda fija por proyecto y el CI la usa sin
instalar nada. Si tu `hermes` global es de otra versión, avisa y corre la del
proyecto. **Sin instalar nada global** también anda: `npm create
@hermesecommerce/store mi-marca` y, dentro de la tienda, `npm run hermes -- login`,
`npm run hermes -- link`, `npm run dev`, `npm run deploy` y `npm run hermes -- domains add …`.
Fuera de un proyecto: `npx @hermesecommerce/cli@^0 <comando>`.

> **Ojo:** El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero.
> Nunca uses `npx hermes`.

- `hermes dev` verifica el link y los tokens, instala dependencias si faltan
  y levanta el server con las `HERMES_*` inyectadas; `hermes preview` hace el
  build de producción y lo sirve en local. Ver
  [la CLI](../packages/cli/README.md).
- **Deploy:** `hermes deploy` publica la tienda en el hosting de Hermes (el
  Cloudflare de Pow, si el plan de la marca lo incluye) y `hermes domains add`
  conecta tu dominio: ver [Deploy en Hermes](#deploy-en-hermes). También
  podés usar cualquier hosting de Next.js (Vercel, Cloudflare con OpenNext):
  cargá las `HERMES_*` en el proyecto, linkeá con `--domain tu-dominio.com`
  (a dónde vuelve el checkout) y `--revalidate-url
  https://tu-dominio.com/api/hermes/revalidate` (purga). Hosteada en Hermes,
  el checkout de la marca queda en tu mismo dominio
  (`www.<tu-dominio>/checkout/...`); con el front afuera, podés sumarle
  `checkout.<tu-dominio>` (`hermes domains add --checkout-subdomain`).
- Después: dominio propio y remitente de los mails de la marca (con Pow).

Qué trae cada página, cómo maneja tokens y caché, y qué queda afuera: el
[README del starter](../starter/README.md). Si preferís arrancar de cero
con tu framework, seguí con el quickstart de abajo.

---

## Deploy en Hermes

Como Shopify Oxygen: la tienda corre en el Cloudflare de Pow y vos **no
necesitás cuenta ni token de Cloudflare**. La CLI hace el build en tu
máquina, lo sube a la API de Hermes y Hermes lo publica. Disponible si el
plan de la marca incluye el hosting (si no, la CLI te lo dice: pedíselo a
Pow). Por ahora, proyectos Next.js (el starter ya viene listo).

```bash
hermes deploy                       # build + publicación en producción
#  ✔ Deploy #12 en el aire
#    URL: https://mi-tienda--mi-marca.hermescdn.app
hermes deploy --preview             # preview de tu branch de git (no toca producción)
#    URL: https://feat-home--mi-tienda--mi-marca.hermescdn.app
hermes deployments                  # historial
hermes rollback 11                  # volver a la versión del deploy #11
```

- **Build**: `@opennextjs/cloudflare build` + `wrangler deploy --dry-run`
  (sólo empaqueta: no habla con Cloudflare). Si tu proyecto no tiene
  `open-next.config.ts` / `wrangler.jsonc`, la CLI los crea; si faltan
  `@opennextjs/cloudflare` y `wrangler`, te ofrece instalarlos
  (devDependencies; `--yes` en CI).
- **Tokens de la tienda**: la tienda publicada usa los tokens **del
  proyecto**, que emite y guarda Hermes (no los de tu `.env`, que son tuyos
  de desarrollo). Van como **secretos** del worker, nunca en texto plano ni
  compilados en el código; el build usa el token público de la tienda. Si
  la tienda tiene `/api/hermes/revalidate` (el starter la trae), Hermes
  también crea y mantiene el webhook de revalidación con su secreto. La CLI
  construye con los `.env*` apartados (OpenNext los compilaría) y aborta si
  encuentra tus secretos en el worker. Las demás variables del `.env` llegan
  al build (p. ej. `NEXT_PUBLIC_*`), no al runtime. El dominio del deploy se
  suma solo a los dominios del token público de la tienda (checkout y CORS).
- **Previews**: una por branch, con URL propia; conviven con producción.
  El plan fija cuántas previews activas y proyectos podés tener (una tienda
  es un proyecto: ver [Trabajar en equipo](#trabajar-en-equipo));
  `hermes deployments rm --branch <x>` borra una.
- **Rollback**: vuelve a subir la versión guardada de ese deploy (con los
  tokens vigentes de la tienda). Se puede volver a cualquier deploy que haya
  estado en el aire.

### Tu dominio

```bash
hermes domains add www.mitienda.com --wait
#  ✔ Dominio agregado a "mi-tienda" (mi-marca).
#  ○ pendiente  www.mitienda.com  (tienda · mi-tienda)
#      Esperando que cargues el CNAME
#      Cargá en el DNS de tu dominio:
#        CNAME www.mitienda.com  →  fallback.hermescdn.app
#      Opcional — Solo si tu dominio hoy apunta a otro sitio …:
#        TXT   _cf-custom-hostname.www.mitienda.com  →  …
#  www.mitienda.com: Emitiendo el certificado (automático, no tenés que hacer nada)
#  ✔ https://www.mitienda.com en el aire.
hermes domains list                 # estado (pendiente / activo / error)
hermes domains remove www.mitienda.com
```

- `mitienda.com` se conecta como `www.mitienda.com` (un dominio pelado no
  puede ser CNAME; redirigí el apex a `www` desde tu proveedor de DNS).
- El checkout hosteado de la marca se sirve en el **mismo dominio**:
  `https://www.mitienda.com/checkout/...` (el despacho de Pow manda
  `/checkout`, `/checkout/*` y `/rails-api/v2/{cart,checkout,geo,users}` al
  checkout; tu tienda no puede usar esos paths: poné el carrito en otra
  ruta, p. ej. `/carrito`). Las sesiones de checkout de la marca abren ahí
  (`https://www.mitienda.com/checkout/s/cs_…`) en cuanto el dominio queda
  activo.
- `--checkout-subdomain` suma además `checkout.mitienda.com` (opt-in, para un
  front hosteado afuera de Pow que quiere el checkout bajo su dominio). Si la
  marca no tiene un `www.` activo en el hosting pero sí ese `checkout.`, las
  sesiones abren en `https://checkout.mitienda.com/checkout/s/cs_…`.
- **Sólo cargás el CNAME.** Cuando apunta a `fallback.hermescdn.app`,
  Cloudflare valida el dominio y emite el certificado (SSL) solo; no hay TXT
  del certificado. El DNS puede tardar de minutos a unas horas. `--wait`
  espera (hasta 15 min, `--timeout <s>`) y muestra cada paso; si no,
  `hermes domains list` cuando quieras.
- El TXT `_cf-custom-hostname` es **opcional**: sólo si tu dominio hoy apunta
  a otro sitio y querés achicar el corte. Cargalo antes de cambiar el CNAME:
  el dominio queda verificado de antemano y, al cambiar el CNAME, sólo falta
  el certificado (unos minutos, automático).
- Un dominio que ya usa otra marca, o uno de Pow, se rechaza.

Cómo funcionan el login, los tokens y los permisos de la CLI: [`cli.md`](./cli.md).

### Los mails de la marca (remitente)

Los mails que Pow le manda al comprador (confirmación de compra, estados del
pedido, código de login, cupones de la ruleta, pedidos de reseña) salen con
el nombre de la marca. Como en Shopify:

- **Por defecto no hay que hacer nada.** Salen de la dirección de Pow
  (`no-reply@pow.la`, firmada con DKIM) con el nombre de la marca —
  `Mi Marca <no-reply@pow.la>` — y las respuestas del comprador van al email de
  la marca (`Reply-To`). No caen en spam porque nunca falsificamos el dominio
  de la marca. Algunos clientes de mail muestran «vía pow.la».
- **Opcional: autenticar el dominio** para que salgan desde
  `ventas@mitienda.com`: mejor entregabilidad y sin el «vía». Por ahora
  está habilitado para algunas marcas (piloto); si la tuya no lo tiene, la
  CLI y el admin te lo dicen («Todavía no disponible para tu marca»).

```bash
hermes mail-domains add mitienda.com
#  ✔ mitienda.com agregado a los mails de mi-marca.
#  ○ pendiente  mitienda.com
#      Cargá en el DNS de tu dominio:
#        CNAME abc…._domainkey.mitienda.com  →  …   (×3, DKIM)
#        MX    bounce.mitienda.com           →  10 …
#        TXT   bounce.mitienda.com           →  v=spf1 include:… ~all
#      Recomendado (DMARC): TXT _dmarc.mitienda.com  →  v=DMARC1; p=none; rua=mailto:dmarc@mitienda.com
hermes mail-domains list                          # remitente actual + estado (pendiente / verificado / error)
hermes mail-domains verify mitienda.com           # volver a chequear ya
hermes mail-sender set ventas@mitienda.com --reply-to atencion@mitienda.com
hermes mail-sender set pow                        # volver a la dirección de Pow
hermes mail-domains remove mitienda.com
```

- Lo mismo desde el admin: **Emails → Remitente y dominio de envío** (registros con
  botón de copiar, estado que se refresca solo, selector de remitente y
  reply-to).
- Los 3 CNAME son de DKIM (obligatorios). El MX y el TXT de `bounce.` son el
  MAIL FROM propio (SPF alineado con tu dominio); si no los cargás, los
  mails igual salen firmados con DKIM. DMARC es recomendado: arrancá con
  `p=none` y cambiá el `rua` por un email que leas.
- El DNS puede tardar hasta 72 h. Pow lo re-chequea solo (y cada vez que
  abrís la pestaña o corrés `list`); si a las 72 h todavía no se ven los CNAME,
  queda en error: revisá los registros, sacalo y volvé a agregarlo.
- El remitente sólo puede ser de un dominio tuyo **verificado**. Si después
  se desverifica (borraron un CNAME), los mails vuelven solos a salir desde
  Pow, te avisamos por mail, y cuando vuelve a verificar salen otra vez
  desde tu dominio.
- Escribir pide ser admin de la marca (como `hermes link`). Un dominio de
  otra marca, o de Pow, se rechaza.

### Trabajar en equipo

Una tienda tiene **un proyecto**, y varios developers con acceso a la marca
trabajan sobre él, como con Hydrogen/Oxygen:

- **Un proyecto, no uno por persona.** `hermes link` usa el proyecto que la
  marca ya tiene (si tiene uno, sin preguntar el nombre; si tiene varios,
  elegís de la lista). No crees otro con tu nombre: el plan fija cuántos
  proyectos puede tener la marca (muchas veces, 1) y uno nuevo no se podría
  deployar. Si te pasás del tope con `--name`, el link te lo dice y te
  sugiere el que existe.
- **Tu branch → `hermes deploy --preview`.** Cada uno trabaja en su branch
  de git y la publica en su URL de preview.
- **Producción → `main` desde CI** con `hermes deploy-token` (abajo).
- **El código, por git.** Commiteá `.hermes/project.json` (marca, proyecto y
  API, sin secretos): así todos —y el CI— deployan al mismo proyecto. El
  `.env` no se commitea.
- **Cada uno con sus tokens.** `hermes link` crea **tus** tokens de
  desarrollo (personales, con `localhost` para CORS) y los escribe en tu
  `.env`. No toca los de la tienda publicada ni los de tus compañeros, así
  que linkear un proyecto que ya está en el aire es seguro. Si te sacan el
  acceso a la marca, tus tokens dejan de valer (en ≤ 1 minuto).
  `hermes env pull --rotate` y `hermes unlink --revoke` sólo tocan los tuyos.
- **La tienda tiene los suyos.** Los maneja Hermes por proyecto y entorno.
  Para rotarlos (p. ej. si sospechás que se filtraron): `hermes tokens
  rotate --runtime` (admin de la marca); Hermes re-deploya con los nuevos y
  después revoca los anteriores, sin cortar la tienda.
- **Previews por branch.** `hermes deploy --preview` publica tu branch en su
  propia URL sin tocar producción: es lo que se comparte para revisar un PR.
- **Sin pisarse.** `hermes deploy` avisa si el deploy activo es de un commit
  que no está en tu branch (quién, cuándo, qué commit) o si tenés cambios
  sin commitear, y pide confirmación. `hermes deployments` muestra commit,
  branch y quién deployó cada versión.
- **Deploy desde CI.** Un admin crea un token de deploy del proyecto
  (`hermes deploy-token create`, se muestra una vez) y lo carga como secreto
  `HERMES_DEPLOY_TOKEN`. Con esa variable, `hermes deploy` no necesita login;
  el token sólo sirve para deployar ese proyecto de esa marca (y ese entorno,
  si lo creaste con `--environment`). `hermes deploy-token list` / `revoke`.

GitHub Actions: producción al pushear a `main` y una preview por PR (que se
borra al cerrarlo).

```yaml
# .github/workflows/hermes.yml
name: Hermes
on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]

concurrency:
  group: hermes-${{ github.event.pull_request.number || 'main' }}
  cancel-in-progress: false

jobs:
  deploy:
    if: github.event_name == 'push' || github.event.action != 'closed'
    runs-on: ubuntu-latest
    env:
      HERMES_DEPLOY_TOKEN: ${{ secrets.HERMES_DEPLOY_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # para el aviso de commits (git merge-base)
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Producción
        if: github.event_name == 'push'
        run: npm run hermes -- deploy --yes
      - name: Preview del PR
        if: github.event_name == 'pull_request'
        run: npm run hermes -- deploy --preview --branch "${{ github.head_ref }}" --yes

  borrar-preview:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    env:
      HERMES_DEPLOY_TOKEN: ${{ secrets.HERMES_DEPLOY_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run hermes -- deployments rm --branch "${{ github.head_ref }}" --yes
```

- En CI va `--yes`: no hay a quién preguntar, y `main` es la verdad (si
  alguien deployó a mano desde otra branch, el push a `main` lo pisa a
  propósito). Para que el aviso de commits funcione en una máquina, el
  commit del deploy activo tiene que estar en tu copia (`git fetch`).
- Un token sin `--environment` sirve para producción y previews. Si querés
  que los PR no puedan publicar producción, usá dos: uno `--environment
  production` (secreto de un *environment* de GitHub protegido) y otro
  `--environment preview`.
- La tienda trae la CLI como devDependency: `npm run hermes -- <comando>`
  usa la versión del proyecto, sin instalar nada global (las tiendas
  creadas con `npm create @hermesecommerce/store` traen el script
  `"hermes": "hermes"`; si la tuya no, sumalo al `package.json`).

---

## Quickstart (10 minutos)

Necesitás: el token público `pst_…` de la marca y, para el paso 5, el privado
`psk_…` (ver [Tokens](#1-tokens)).

```bash
export POW=https://api.pow.la/api
export PST=pst_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # público
export PSK=psk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # privado (SÓLO server-side)

# 1. Config de la marca (moneda, checkout, Google login)
curl -s "$POW/v2/storefront/config" -H "X-Storefront-Token: $PST"

# 2. Un listado de productos (PLP) y una ficha (PDP)
curl -s "$POW/v2/products?page_number=1" -H "X-Storefront-Token: $PST"
curl -s "$POW/v2/items/remera-basica" -H "X-Storefront-Token: $PST"

# 3. Agregar al carrito: el PRIMER add crea el carrito y devuelve el token en
#    el header de respuesta X-Cart-Token (guardalo: dura 30 días)
curl -si "$POW/v2/cart/add" -H "X-Storefront-Token: $PST" \
  -H 'Content-Type: application/json' \
  -d '{"variant_id": 12345, "quantity": 1}' | grep -i x-cart-token
export CRT=crt_...   # el valor del header

# 4. Crear la sesión de checkout hosteado y mandar al comprador a `url`
curl -s "$POW/v2/checkout_sessions" -H "X-Storefront-Token: $PST" \
  -H 'Content-Type: application/json' \
  -d "{\"cart_token\":\"$CRT\",
       \"return_url\":\"https://tienda.agencia.com/gracias\",
       \"cancel_url\":\"https://tienda.agencia.com/carrito\"}"
# → { "id": "cs_…", "url": "https://www.marca.com/checkout/s/cs_…", "expires_at": "…" }

# (return_url y cancel_url son opcionales: en localhost mandá sólo cart_token)

# 5. Cuando vuelve a tu return_url (?order_id=…&checkout_session_id=cs_…),
#    consultá el estado SERVER-SIDE con el token privado
curl -s "$POW/v2/checkout_sessions/cs_..." -H "X-Storefront-Private-Token: $PSK"
# → { "status": "completed", "payment_status": "paid", "order_id": 987, "amount": 45999.9, … }
```

El mismo flujo en TypeScript (server-side, p. ej. una route handler de Next.js):

```ts
const POW = 'https://api.pow.la/api';
const PST = process.env.HERMES_PUBLIC_TOKEN!; // pst_…
const PSK = process.env.HERMES_PRIVATE_TOKEN!; // psk_… (nunca al navegador)

async function pow<T>(path: string, init: RequestInit = {}): Promise<{ data: T; res: Response }> {
  const res = await fetch(`${POW}${path}`, {
    ...init,
    headers: {
      'X-Storefront-Token': PST,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => null)) as T;
  if (!res.ok) {
    const e = data as { error?: string; errors?: string[] } | null;
    throw new Error(e?.error ?? e?.errors?.join(' · ') ?? `HTTP ${res.status}`);
  }
  return { data, res };
}

// Agregar al carrito (crea el carrito si no hay token)
export async function agregar(variantId: number, cartToken?: string) {
  const { data, res } = await pow('/v2/cart/add', {
    method: 'POST',
    headers: cartToken ? { 'X-Cart-Token': cartToken } : {},
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  });
  return { data, cartToken: res.headers.get('X-Cart-Token') ?? cartToken };
}

// Ir a pagar: sesión de checkout hosteado → redirect
export async function irAPagar(cartToken: string) {
  const { data } = await pow<{ id: string; url: string }>('/v2/checkout_sessions', {
    method: 'POST',
    body: JSON.stringify({
      cart_token: cartToken,
      return_url: 'https://tienda.agencia.com/gracias',
      cancel_url: 'https://tienda.agencia.com/carrito',
    }),
  });
  return data.url; // redirect 303 a esta URL
}

// En /gracias: el estado real del pago (server-side, token privado)
export async function estado(sessionId: string) {
  const res = await fetch(`${POW}/v2/checkout_sessions/${sessionId}`, {
    headers: { 'X-Storefront-Private-Token': PSK },
    cache: 'no-store',
  });
  return res.json() as Promise<{ status: string; payment_status: string | null; order_id: number | null }>;
}
```

---

## 1. Tokens

Los tokens los emite Pow por marca. Hay dos tipos y nunca se
mezclan: cada header acepta sólo el suyo.

| | Público `pst_…` | Privado `psk_…` |
|---|---|---|
| Header | `X-Storefront-Token` | `X-Storefront-Private-Token` |
| Dónde vive | Puede ir en el navegador o en una app | **Sólo en tu servidor** (variable de entorno). Nunca en el bundle del front |
| Para qué | Identifica la marca en toda la API pública: catálogo, carrito, cuenta, checkout, crear sesiones de checkout | Lo que digan sus scopes: leer el estado de las sesiones de checkout (`checkout_sessions:read`, el default) y, si lo pedís, gestionar webhooks (`webhooks:manage`) |
| Dominios permitidos | Sí: los hosts a los que puede volver una sesión de checkout (`return_url`/`cancel_url`) y desde los que el navegador puede llamar la API (CORS). Se los pedís a Pow | No aplica |

Cómo pedirlos: escribile a tu contacto de Pow con la marca, el nombre de tu
storefront, la lista de dominios (p. ej. `tienda.agencia.com`,
`preview.tienda.agencia.com`) y si vas a usar webhooks. Los permisos del token
privado se eligen al crearlo (mínimo privilegio): por default sólo lee
sesiones de checkout; para webhooks se pide `webhooks:manage` y Pow lo
**vincula a tu token público**, porque tus webhooks sólo reciben las compras
de las sesiones creadas con ese público (otra agencia de la misma marca no ve
tus ventas, ni vos las suyas). El token en claro se muestra UNA sola vez: Pow te
lo pasa por un canal seguro y guarda sólo su hash. Si se filtra, pedí que lo
revoquen (tarda hasta 60 s en propagarse) y te emiten otro. Revocar el token
privado **desactiva sus webhooks** y corta los reintentos pendientes: con el
token nuevo volvés a crear las suscripciones.

**Con la CLI (si tenés usuario del backoffice).** `hermes login` (o `npx
@hermesecommerce/cli login` sin instalarla) y después `hermes link` en la carpeta del proyecto: elegís la marca, se
crean el público y el privado (con `webhooks:manage`, vinculado al público) y
se escriben en tu `.env`. Pide ser admin de la marca. Volver a linkear el
mismo proyecto con la misma cuenta **rota** sus tokens (los anteriores se revocan; los de otra agencia o de Pow no se tocan). Más en
[`cli.md`](./cli.md).

**`X-Client-ID`.** Algunas marcas todavía aceptan `X-Client-ID: <marca>` en lugar
del token público. No lo uses en un desarrollo nuevo: la marca puede pasar a
exigir token en cualquier momento (y entonces sin token recibís `401 Falta el
token de storefront`).

**CORS.** Lo recomendado es llamar la API desde tu servidor (SSR, route
handlers, un BFF): así además cacheás el catálogo y el token privado nunca
toca el navegador. Si necesitás llamarla directo desde el navegador, no hace
falta pedir nada aparte: en las rutas públicas (`/api/v2/**`,
`/api/storefront/**`, `/api/resenas/**`) la API acepta como origen
`https://<dominio>` para cada dominio cargado en tu **token público** (los
mismos de `return_url`/`cancel_url`). Reglas:

- Sólo `https://`, host exacto y puerto default. `www.tienda.agencia.com` y
  `tienda.agencia.com` son dominios distintos: cargá los dos si usás los dos.
  No hay wildcards (`*.agencia.com` no existe): cada host de preview
  se carga aparte.
- El pedido real tiene que llevar `X-Storefront-Token` con tu token público:
  el origen se valida contra los dominios de ESE token. El preflight
  (`OPTIONS`, que el navegador manda sin el token) se acepta si el host está
  cargado en algún token público vigente.
- Sin cookies: la respuesta no lleva `Access-Control-Allow-Credentials`. No
  uses `credentials: 'include'`; el carrito y la sesión del comprador viajan
  en headers (`X-Cart-Token`, `X-Customer-*`, expuestos por CORS).
- `X-Storefront-Private-Token` nunca se acepta por CORS, a propósito, y un
  token privado en `X-Storefront-Token` no habilita nada.
- Si se revoca el token o se quita un dominio, deja de valer en ≤ 60 s.
- Desarrollo local: los tokens de desarrollo que crea `hermes link` traen
  `localhost` entre sus dominios, así que con ESE token público se acepta
  `http://localhost:<puerto>` y `http://127.0.0.1:<puerto>`. Los demás
  tokens, no. (`localhost` no sirve como `return_url`/`cancel_url`: ver
  [Checkout](#6-checkout).)

---

## 2. Config de la marca

`GET /api/v2/storefront/config` es lo primero que pide tu storefront (cacheala
unos minutos):

- `checkout`: la configuración del checkout hosteado (marca, logo, datos
  fiscales, colores, fuente, GTM, etc.) o `null`.
- `google_client_id`: si está, la marca tiene login con Google.

Otros endpoints útiles para armar el layout: `GET /api/v2/categories/header`
(menú), `GET /api/v2/settings/footer`, `…/announcement`, `…/popup`,
`…/integrations` (píxeles, GTM, chat, etc.), `GET /api/v2/storefront/apps`
(qué apps tiene instaladas la marca: reseñas, etiquetas, favoritos…).

---

## 3. Catálogo

| Qué | Endpoint |
|---|---|
| Listado general / búsqueda en el listado | `GET /api/v2/products?q=&page_number=` |
| Listado de una categoría | `GET /api/v2/products/category/{slug}` |
| Filtros (facetas) | `GET /api/v2/products/filters` |
| Ficha de producto (PDP) | `GET /api/v2/items/{slug}` |
| Cambiar color / variante en la ficha | `GET /api/v2/items/{id}/change_variant`, `…/update_variant` |
| Relacionados / "completá el look" | `GET /api/v2/items/{id}/related`, `…/look` |
| Buscador (autocompletar y resultados) | `GET /api/v2/search/suggest?q=`, `GET /api/v2/search?q=` |
| Sitemap | `GET /api/storefront/sitemap` |

Los listados paginan con `page_number` (el tamaño de página lo define la
marca y vuelve en `items_per_page`, junto con `total` y `current_page`). Los
filtros (`multicolors`, `multisizes`, `multicategories`, `min_and_max_price`,
`discount_ranges`, propiedades por nombre como `Color`/`Talle`…) y el orden
(`price=1` / `price=-1`, `views`, `new`) están en la spec, igual que las facetas disponibles
(`/v2/products/filters`). Los precios vienen formateados en la moneda de la
marca además del número, tal cual los usa el storefront de Pow.

```ts
const { data } = await pow<{ items: unknown[]; total: number; items_per_page: number }>(
  `/v2/products/category/remeras?page_number=1&price=1`,
);
```

**Cache.** Cacheá el catálogo y el contenido por tags y purgalos con el
webhook `storefront/revalidate`: ver [8. Cache y purga](#8-cache-y-purga). No
cachees nada del carrito, la cuenta ni el checkout.

---

## 4. Carrito

- El carrito se identifica con un token `crt_…` en `X-Cart-Token`.
- El **primer** `POST /api/v2/cart/add` sin token crea el carrito y devuelve el
  token en el **header de respuesta** `X-Cart-Token` (una sola vez). Guardalo
  en una cookie httpOnly de tu dominio.
- Vive 30 días desde la última actividad. Un token vencido o inválido no da
  error: `GET /api/v2/cart` devuelve el carrito vacío.
- No hay reserva de stock: el stock se valida al agregar y de nuevo al pagar.

| Qué | Endpoint |
|---|---|
| Ver el carrito | `GET /api/v2/cart` |
| Agregar | `POST /api/v2/cart/add` `{ "variant_id": 123, "quantity": 1 }` |
| Cambiar cantidad | `PATCH /api/v2/cart/items/{id}` `{ "quantity": 2 }` |
| Sacar | `DELETE /api/v2/cart/items/{id}` |
| Cupón | `POST /api/v2/cart/apply_coupon` `{ "code": "…" }` · `POST /api/v2/cart/remove_coupon` |
| Recomendados | `GET /api/v2/cart/recommended` |

```bash
curl -s "$POW/v2/cart" -H "X-Storefront-Token: $PST" -H "X-Cart-Token: $CRT"
```

---

## 5. Cuenta del comprador

Login con email y contraseña (`POST /api/v2/users/sign_in`), registro
(`…/sign_up`), código por mail (`…/send_code` + `…/verify_code`) y Google
(`POST /api/v2/users/google` con el `credential` de Google Identity Services,
usando el `google_client_id` de la config).

Las respuestas de login devuelven la sesión en **headers**:
`X-Customer-Token` (access, 15 minutos) y `X-Customer-Refresh` (refresh
rotativo, con su vida en `X-Customer-Refresh-Max-Age`). Guardalos en cookies
httpOnly. Mandá `X-Customer-Token` en las rutas de la cuenta (`/v2/users/me`,
`orders`, `addresses`, `profile`, `password`); cuando vence (401), canjeá el
refresh en `POST /api/v2/users/refresh` (te devuelve un par nuevo: el refresh
viejo deja de valer). `DELETE /api/v2/users/sign_out` cierra la sesión.

---

## 6. Checkout

Hay dos caminos. Para la mayoría de las agencias, el (a).

### (a) Checkout hosteado de Pow (recomendado)

El comprador paga en el checkout de Pow, **en el dominio de la marca**
(`https://<marca>/checkout/s/<id>`): mismos medios de pago, antifraude,
facturación y mails que el resto de la marca, sin que vos toques datos de pago.
El host del link es, en este orden: el dominio propio activo de la tienda
hosteada en Hermes (`www.<dominio>`; con varios, el conectado más
recientemente), su `checkout.<dominio>` activo (`--checkout-subdomain`), o el
storefront que Pow tiene configurado para la marca.

1. **Crear la sesión** — `POST /api/v2/checkout_sessions` con el token
   **público** de tu storefront (es el que tiene tus dominios permitidos):

   ```json
   { "cart_token": "crt_…",
     "return_url": "https://tienda.agencia.com/gracias",
     "cancel_url": "https://tienda.agencia.com/carrito" }
   ```

   `return_url` y `cancel_url` son **opcionales** (cada una por separado).
   Si las mandás: https, sin puerto ni credenciales, y el host tiene que
   estar entre los dominios permitidos del token o ser un host propio de la
   marca en el hosting de Hermes (su `www.<dominio>` activo o el host por
   defecto `…--<marca>.hermescdn.app` de un deploy); si no: 422. El carrito
   tiene que tener al menos un producto.

   **Desarrollo local (localhost, Hydrogen, etc.):** `http://localhost` no
   puede ser `return_url` (no es https ni un dominio cargado). Creá la sesión
   sólo con `{ "cart_token": "crt_…" }`: la compra termina en la página de
   confirmación del checkout de la marca y "Volver a la tienda" lleva a la
   tienda de la marca. El estado del pago lo seguís leyendo con
   `GET /api/v2/checkout_sessions/{id}` o el webhook `checkout/completed`. Si
   la tienda todavía no tiene habilitadas las sesiones sin URL, el `POST`
   contesta 422 `"Esta tienda todavía no admite sesiones sin URL de vuelta"`:
   pedíselo a Pow o mandá las dos URLs.
   Respuesta `201`: `{ "id": "cs_…", "url": "https://www.marca.com/checkout/s/cs_…", "expires_at": "…" }`.

2. **Redirigir** al comprador a `url` (un 303 desde tu servidor o
   `window.location`). La sesión es de **un solo uso** y vence a las **24 h**
   sin abrirse. Para reintentar, creá otra.

3. **La vuelta.** Al terminar, el comprador vuelve a
   `return_url?order_id=987&checkout_session_id=cs_…`. Si abandona, o la
   sesión ya no sirve (usada, vencida, carrito vacío), vuelve a `cancel_url`.
   Sin `return_url` se queda en la confirmación de la marca; sin `cancel_url`
   "Volver al carrito" y las pantallas de error llevan a la tienda de la marca.

4. **El estado del pago** — nunca confíes en la query de la vuelta: consultá
   `GET /api/v2/checkout_sessions/{id}` desde tu servidor con el token
   **privado**:

   | `status` | Significado |
   |---|---|
   | `open` | Creada o en curso |
   | `completed` | La compra terminó (orden paga, o pedida con un medio offline) |
   | `expired` | Venció sin usarse |

   | `payment_status` | Significado |
   |---|---|
   | `paid` | Pagada (o ya despachada / finalizada) |
   | `pending` | Esperando el pago (p. ej. transferencia o efectivo) |
   | `failed` | La pasarela rechazó el pago |
   | `canceled` | Cancelada, o venció el plazo para pagar |
   | `null` | Todavía no hay orden |

   Si el pago sigue abierto, el GET re-consulta a la pasarela (como mucho cada
   10 s), así que sirve para la página de "gracias" aunque el comprador vuelva
   directo desde Mercado Pago. `amount` viene en la moneda de la marca
   (`currency`).

5. **Webhook** `checkout/completed` (ver [Webhooks](#7-webhooks)): te avisa sin
   que consultes. Usá los dos: el webhook para tu backoffice/CRM y el GET para
   la página de "gracias".

### (b) Checkout propio

Si necesitás un checkout 100% tuyo, la API expone los pasos (`/api/v2/checkout`:
identificación, envío con cotización y sucursales, facturación, medios de pago
y pago con Mercado Pago / saldo MP / medios offline, con `X-Idempotency-Key`).
Es más trabajo y más responsabilidad (datos de pago, errores de pasarela, 3DS);
hablalo con Pow antes de encararlo. Todo está en la spec (tag **Checkout**).

---

## 7. Webhooks

Recibí eventos de la marca en tu servidor:

- `checkout/completed`: sólo de las sesiones de checkout creadas con el token
  público de tu agencia (el vinculado a tu token privado). Las compras hechas
  en el checkout propio de la marca o desde otra agencia no te llegan.
- `storefront/revalidate`: los tags de caché que Pow purgó de la marca (lo
  reciben todas las agencias de la marca). Ver [8. Cache y purga](#8-cache-y-purga).

### Gestionar suscripciones (self-service, token privado)

Todos con `X-Storefront-Private-Token: psk_…` (scope `webhooks:manage`; sin el
scope: 403). Cada token ve y gestiona sólo las suscripciones que creó.

| Qué | Endpoint |
|---|---|
| Listar | `GET /api/v2/webhook_subscriptions` |
| Crear | `POST /api/v2/webhook_subscriptions` `{ "event": "checkout/completed", "url": "https://api.agencia.com/pow/webhooks" }` |
| Borrar | `DELETE /api/v2/webhook_subscriptions/{id}` |
| Rotar el secreto | `POST /api/v2/webhook_subscriptions/{id}/rotate_secret` |
| Evento de prueba | `POST /api/v2/webhook_subscriptions/{id}/test` |

```bash
curl -s "$POW/v2/webhook_subscriptions" -X POST \
  -H "X-Storefront-Private-Token: $PSK" -H 'Content-Type: application/json' \
  -d '{"event":"checkout/completed","url":"https://api.agencia.com/pow/webhooks"}'
# → 201 { "webhook_subscription": { "id": 42, …, "secret": "whsec_…" } }   ← el secreto, UNA vez
```

- La `url` tiene que ser https, de un dominio público (sin IP, puerto ni
  credenciales) y no resolver a una red interna. Hasta 10 suscripciones
  activas por token y 30 altas por día por token.
- El `secret` (`whsec_…`) se muestra **una sola vez**, al crear y al rotar (Pow
  lo guarda cifrado). Rotar invalida el anterior en el acto.
- `POST …/test` (10 por hora por token) manda en el momento un evento
  `webhook/test` firmado y te devuelve `delivered` y el status con el que
  contestó tu endpoint si fue 2xx/4xx/5xx (`{ "delivered": true, "status": 200, … }`).
  Un redirect, un timeout, un error de DNS o un destino bloqueado dan
  `status: null`, sin más detalle. Úsalo para probar la verificación de firma.
- Las entregas reales empiezan cuando Pow habilita los webhooks de la marca
  (avisanos al crear la primera suscripción). El evento de prueba anda siempre.

### Qué recibís

Un `POST` con `Content-Type: application/json` y estos headers:

| Header | Valor |
|---|---|
| `X-Webhook-Event` | `checkout/completed`, `storefront/revalidate` (o `webhook/test`) |
| `X-Webhook-Id` | Id del evento: **el mismo en cada reintento** |
| `X-Webhook-Signature` | `sha256=<hex>`: HMAC-SHA256 del **cuerpo crudo** con tu secreto |

Cuerpo de `checkout/completed`:

```json
{
  "event": "checkout/completed",
  "id": "18342",
  "timestamp": "2026-10-26T15:04:05.123Z",
  "checkout_session": {
    "id": "cs_3f2a…",
    "status": "completed",
    "order_id": 987,
    "amount": 45999.9,
    "currency": "ARS",
    "completed_at": "2026-10-26T15:04:01.000Z"
  }
}
```

`completed` quiere decir que la compra terminó: orden paga **o** pedida con un
medio offline (transferencia, efectivo). Si te importa que esté cobrada,
mirá `payment_status` con `GET /api/v2/checkout_sessions/{id}`.

### Verificar la firma

- **Algoritmo:** HMAC-SHA256, clave = el secreto tal cual (`whsec_…`, UTF-8),
  mensaje = el cuerpo **crudo** (los bytes recibidos, antes de parsear).
  Header: `X-Webhook-Signature: sha256=<hex en minúscula>`.
- **Timestamp y tolerancia:** `timestamp` va dentro del cuerpo firmado y se
  renueva en cada intento. Rechazá eventos con más de **5 minutos** de
  diferencia con tu reloj (protege contra replays).
- **Idempotencia:** guardá los `id` (= `X-Webhook-Id`) procesados y descartá
  los repetidos: un reintento trae el mismo `id`.
- **Comparación** en tiempo constante.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export async function POST(req: Request) {
  const raw = await req.text(); // el cuerpo CRUDO
  const firma = req.headers.get('x-webhook-signature') ?? '';
  const esperada = 'sha256=' + createHmac('sha256', process.env.HERMES_WEBHOOK_SECRET!).update(raw).digest('hex');
  const ok = firma.length === esperada.length && timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
  if (!ok) return new Response('firma inválida', { status: 401 });

  const evento = JSON.parse(raw) as { id: string; event: string; timestamp: string };
  if (Math.abs(Date.now() - Date.parse(evento.timestamp)) > 5 * 60_000)
    return new Response('evento viejo', { status: 400 });
  if (await yaProcesado(evento.id)) return new Response(null, { status: 200 });

  await encolar(evento); // procesá aparte: contestá rápido
  return new Response(null, { status: 200 });
}
```

### Entrega y reintentos

- Contestá **2xx en menos de 10 s** (procesá en segundo plano).
- **5xx, timeout o error de red** → reintento: hasta **4 intentos** en total,
  con espera exponencial (≈1, 2 y 4 minutos). Después se da por fallido.
- `storefront/revalidate` reintenta menos y más rápido (**3 intentos**, ≈15 y
  30 s): una purga vieja sirve poco y el TTL es la red de seguridad.
- **4xx** → no se reintenta (lo tomamos como "no lo quiero").
- Sin orden garantizado entre eventos distintos.
- **No se siguen redirects**: un 3xx es un fallo y no se reintenta. Apuntá la
  suscripción a la URL final.
- Cada envío resuelve el DNS de tu dominio y sólo conecta a IPs públicas
  (anti-SSRF); un dominio que resuelve a una red interna no recibe nada.

---

## 8. Cache y purga

Pow purga su propia caché cuando algo cambia en la marca (un producto, una
categoría, una landing, la home, los settings…). Tu storefront se entera por
el webhook **`storefront/revalidate`**, con **los mismos tags** que purgamos
nosotros. Así podés cachear agresivo y mostrar los cambios en segundos.

### 1. Taggeá cada respuesta

Cada GET cacheable de la spec trae dos extensiones:

- **`x-cache-tags`**: los tags de esa respuesta, como plantillas. `{nombre}` es
  el parámetro de path o de query con ese nombre (si tu pedido no lo trae, ese
  tag no va). Ejemplos:

  | Endpoint | `x-cache-tags` | `x-cache-ttl` |
  |---|---|---|
  | `GET /v2/items/{id}` (PDP, `id` = slug) | `product`, `product-{id}` | `short` |
  | `GET /v2/products/category/{slug}` | `products`, `category-{slug}` | `short` |
  | `GET /v2/products/filters?category_name=` | `products`, `category-{category_name}` | `short` |
  | `GET /v2/categories/header` | `header`, `categories` | `long` |
  | `GET /v2/home/page_blocks` | `home-page-blocks` | `short` |
  | `GET /v2/landings/{slug}` | `landings`, `landing-{slug}` | `long` |
  | `GET /v2/static_contents/{path}` | `static-contents`, `static-content-{path}` | `long` |
  | `GET /v2/settings/footer` | `footer` | `long` |
  | `GET /v2/settings/*`, `GET /v2/storefront/config` | `settings` (+ el propio) | `long` |

- **`x-cache-ttl`**: el TTL sugerido: `short` = **60 s** (lo que depende de
  precio y stock), `long` = **3600 s** (contenido y configuración), `none` = no
  lo caches (stock en vivo, links de mails). Los segundos están en la raíz de
  la spec (`x-cache-ttl-seconds`). `x-cache-tags: []` = sólo TTL (Pow no purga
  ese dato).

Con el SDK no tenés que armarlos: `pow.catalog.product.cacheTags(slug)`,
`cacheTagsFor('Pdp_show', { id: slug })`, y en Next.js
`createStorefrontClient` de `@hermesecommerce/storefront/next` le pone
`next: { tags, revalidate }` a cada fetch solo.

### 2. Suscribite a `storefront/revalidate`

```bash
curl -s "$POW/v2/webhook_subscriptions" -X POST \
  -H "X-Storefront-Private-Token: $PSK" -H 'Content-Type: application/json' \
  -d '{"event":"storefront/revalidate","url":"https://tienda.agencia.com/api/hermes/revalidate"}'
```

Llega firmado igual que cualquier webhook (ver [Verificar la firma](#verificar-la-firma)):

```json
{
  "event": "storefront/revalidate",
  "id": "rv_marca_179612345_0",
  "timestamp": "2026-10-26T15:04:05.123Z",
  "tags": [
    { "tag": "product-remera-lisa", "mode": "soft" },
    { "tag": "category-sale", "mode": "soft" },
    { "tag": "category-invierno-2025", "mode": "hard" }
  ]
}
```

- **Agrupado:** las purgas se juntan por marca en ventanas de ~10 s: te llega
  a lo sumo un evento cada 10 s por suscripción (hasta 500 tags por evento;
  si hay más, varios eventos con distinto `id`). En un día de mucho movimiento
  (Cyber) no te llueven miles de requests.
- **Idempotencia:** el `id` se repite en los reintentos; purgar dos veces es
  inofensivo, así que podés ignorarlo.

### 3. Purgá: soft por defecto, hard puntual

- **`soft`** (casi todo): marcá el tag stale. El próximo visitante recibe la
  copia anterior al instante y la regeneración corre atrás
  (stale-while-revalidate). Nadie espera y tu origen no recibe una avalancha.
- **`hard`**: algo **dejó de existir** y no hay que servir la copia vieja ni
  una vez: categoría borrada u ocultada, landing despublicada o borrada (y el
  slug viejo de una landing renombrada). Expirá la entrada: el próximo pedido
  espera el dato nuevo.

En Next.js (16+): `soft` → `revalidateTag(tag, 'max')`, `hard` →
`revalidateTag(tag, { expire: 0 })` (`updateTag` sólo anda en Server Actions).
En Next 14/15 `revalidateTag(tag)` siempre expira: los dos modos son hard. El
SDK lo resuelve con `createRevalidateRoute({ secret })`; en otro framework,
`handleRevalidateWebhook({ rawBody, signatureHeader, secret, onTags })`.

> **Limitación conocida:** hoy un producto deshabilitado o borrado no dispara
> purga (ni de su ficha ni de sus listados): sale de tu caché por TTL (60 s,
> `short`). Si para vos es crítico, tratá un 404 de la PDP como "sacalo de tu
> caché".

### 4. El TTL es la red de seguridad

Usá siempre el TTL sugerido aunque estés suscripto: una purga se puede
perder (tu endpoint caído, un despliegue). Con stale-while-revalidate el TTL
no le cuesta latencia al comprador. Sin suscripción, el TTL es lo único que
actualiza tu caché.

---

## 9. Reseñas

Si la marca tiene la app Reseñas (`GET /api/v2/storefront/apps`):

- Lista y resumen de un producto: `GET /api/v2/items/{slug}/product_reviews`
  (paginada; filtros por puntaje, compra verificada y con fotos).
- Galería de fotos: `GET /api/v2/items/{slug}/product_reviews/photos`.
- Formulario: `GET /api/v2/product_reviews/form?product_id=` (o `?token=` del
  link del mail de pedido de opinión).
- Alta: `POST /api/v2/product_reviews` (201). Con fotos: el alta devuelve URLs
  firmadas en `uploads` (10 min); subí cada archivo con `PUT` a su URL y
  confirmá con `POST /api/v2/product_reviews/{id}/photos`.
- Baja de los mails de pedido de opinión: `GET`/`POST
  /api/v2/product_reviews/unsubscribe?token=`.

Con la app apagada, estos endpoints contestan 404.

---

## 10. Errores

Siempre JSON, con uno de estos dos formatos:

```json
{ "error": "Sesión de checkout no encontrada" }
```

```json
{ "errors": ["return_url: https y de un dominio permitido para el token", "cart_token: inválido"] }
```

| Status | Cuándo |
|---|---|
| 400 | Pedido mal formado |
| 401 | Falta el token, es inválido o fue revocado (o la sesión del comprador venció) |
| 403 | El token no tiene permiso para eso (scope) |
| 404 | No existe (o la app de la marca está apagada) |
| 409 / 410 | El recurso ya cambió de estado / venció (p. ej. una sesión de checkout usada o vencida) |
| 422 | Validación: mirá `errors` |
| 429 | Rate limit: esperá lo que diga `Retry-After` (segundos) |
| 5xx | Error nuestro: reintentá con backoff; los 500 traen `request_id` para reportarlo |

Excepciones heredadas del storefront de Pow (no cambian en `v2`): el **carrito** contesta sus errores de negocio como
`{ "success": false, "message": "…" }` (p. ej. sin stock, cupón inválido), y
los pasos del **checkout propio** y los **pagos** como
`{ "ok": false, "error": "…", "errors": [...], "next": "…" }`. Cada endpoint
lo tiene documentado en la spec.

## 11. Rate limits

Las lecturas de catálogo y contenido no tienen límite por cliente, pero
cacheálas: es lo que hace rápido a tu storefront. Hay límites por IP en lo
sensible (pueden cambiar; respetá `Retry-After`):

| Endpoint | Límite |
|---|---|
| `POST /v2/users/sign_in` | 120 / 5 min |
| `POST /v2/users/sign_up` | 60 / hora |
| `POST /v2/users/refresh` | 300 / min |
| `POST /v2/users/send_code` | 60 / 10 min |
| `POST /v2/users/verify_code`, `POST /v2/users/google` | 120 / 10 min |
| `GET /v2/users/exists` | 60 / min y 600 / hora |
| `POST /v2/search/events` | 300 / min |
| `POST /v2/product_reviews`, `…/unsubscribe` | 30 / hora |
| `POST /v2/product_reviews/{id}/photos` | 20 / hora |
| `POST /v2/webhook_subscriptions` | 30 / hora por IP y 30 / día por token |
| `POST /v2/webhook_subscriptions/{id}/rotate_secret` | 30 / hora por IP y por token |
| `POST /v2/webhook_subscriptions/{id}/test` | 30 / hora por IP y 10 / hora por token |

Si llamás desde tu servidor, todo tu tráfico sale de pocas IPs: para login y
registro reenviá la IP real del comprador en `X-Forwarded-For` desde un proxy
de confianza, o hablá con Pow.

## 12. Versionado

- `v2` es **estable**: sólo cambios aditivos (campos nuevos en las respuestas,
  endpoints nuevos, valores nuevos en enums documentados como abiertos).
  Tu código tiene que ignorar los campos que no conoce.
- Un cambio incompatible (sacar o renombrar un campo, cambiar un tipo o un
  status) sale en `v3`, que convive con `v2` el tiempo que haga falta para
  migrar.
- La spec (`/api/v2/openapi.json`) siempre refleja lo que está en producción.

## 13. Checklist antes de salir a producción

- [ ] El token privado está sólo en variables de entorno del servidor (con
      `hermes deploy` ya va como secreto del worker).
- [ ] Con el hosting de Hermes: `hermes domains list` muestra tu dominio
      (www. y checkout.) **activo**, y probaste un rollback en una preview.
- [ ] Tus dominios de producción están cargados en el token público.
- [ ] (Opcional) `hermes mail-domains list` muestra tu dominio de mail
      **verificado** y el remitente elegido (`hermes mail-sender set …`);
      si no, los mails salen de Pow con el nombre de tu marca.
- [ ] La página de "gracias" consulta `GET /v2/checkout_sessions/{id}` (no
      confía en la query).
- [ ] El endpoint de webhooks verifica firma, timestamp e `id` repetido, y
      contesta 2xx en menos de 10 s. Probado con `…/test`.
- [ ] El catálogo y el contenido están cacheados por tags (`x-cache-tags`)
      con TTL de red de seguridad, y suscriptos a `storefront/revalidate`;
      carrito, cuenta y checkout no se cachean.
- [ ] Manejás 401 (token revocado / sesión vencida), 422 y 429.

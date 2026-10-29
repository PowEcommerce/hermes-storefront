# @hermesecommerce/cli

CLI de Hermes para agencias que construyen el storefront headless de una marca
de Pow (estilo `gh auth login` / `shopify hydrogen link` / `hydrogen dev`).
Binario: `hermes`. Para arrancar una tienda desde cero, el
[starter](https://github.com/PowEcommerce/hermes-storefront/tree/main/starter): `hermes create` (= `npm create @hermesecommerce/store`).

```bash
npm install -g @hermesecommerce/cli   # o, sin instalar nada global: npx @hermesecommerce/cli@^0 <comando>
```

> **Ojo:** El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero. Por eso nunca uses `npx hermes`: fuera de un proyecto
> con la CLI instalada, baja y ejecuta ese paquete ajeno.

Necesitás Node 18+ y un usuario del backoffice de Pow (el mismo con el que
entrás al admin). Para crear tokens tenés que ser **admin de la marca**.

## Recorrido de una tienda nueva

```bash
npm install -g @hermesecommerce/cli    # 1. una sola vez por máquina (como `@shopify/cli`)
hermes create mi-marca                 # 2. = npm create @hermesecommerce/store mi-marca
cd mi-marca                            # 3.
hermes login                           # 4. tu usuario del backoffice (una vez por máquina)
hermes link                            # 5. elegís la marca → tokens HERMES_* en .env
hermes dev                             # 6. http://localhost:3000 con los datos de la marca
hermes deploy                          # 7. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 8. tu dominio (o desde el admin: Configuración → Dominios)
hermes mail-domains add mi-marca.com   # 9. opcional: mails desde tu dominio (o en el admin: Emails → Remitente)
```

La tienda trae la CLI como devDependency (como el template de Hydrogen trae
`@shopify/cli`): la versión queda fija por proyecto y el CI la usa sin
instalar nada. Si tu `hermes` global es de otra versión, avisa y corre la del
proyecto. **Sin instalar nada global** también anda: `npm create
@hermesecommerce/store mi-marca` y, dentro de la tienda, `npm run hermes -- login`,
`npm run hermes -- link`, `npm run dev`, `npm run deploy` y `npm run hermes -- domains add …`.

En un proyecto que no la trae como dependencia: `hermes <comando>` con la
global, o `npx @hermesecommerce/cli@^0 <comando>`.

Queda en tu `.env` (sin tocar el resto de tus variables):

```dotenv
# Hermes (escrito por `hermes link`)
HERMES_TENANT=tu-marca
HERMES_API_URL=https://api.pow.la/api
HERMES_PUBLIC_TOKEN=pst_…        # X-Storefront-Token (puede ir al navegador)
HERMES_PRIVATE_TOKEN=psk_…       # X-Storefront-Private-Token (SÓLO server-side)
HERMES_REVALIDATE_SECRET=whsec_… # si usaste --revalidate-url
```

y `.env` se agrega a tu `.gitignore` si no estaba.

## Comandos

### `hermes create [carpeta] [opciones]`

Crea una tienda nueva desde el starter: delega en
`@hermesecommerce/create-store` de la misma major que la CLI
(`npx --yes @hermesecommerce/create-store@^0`) con las mismas opciones (`--no-install`, `--pm <npm|pnpm|yarn|bun>`,
`--link`/`--no-link`, `--help`). Para probar un generador sin publicar:
`HERMES_CREATE_STORE_BIN=…/create/dist/index.js hermes create x`.

### CLI global y CLI del proyecto

Si corrés la `hermes` global dentro de una tienda que trae otra versión en
`node_modules/@hermesecommerce/cli` (subiendo desde la carpeta actual), avisa
y le pasa el comando a la del proyecto, como la CLI de Shopify. Con la misma
versión corre la global. `HERMES_CLI_NO_DELEGAR=1` lo desactiva (y es lo que
la global le pone a la local, para no rebotar).

### `hermes login [--api <url>] [--no-browser]`

Login con el **Device Authorization Grant** (RFC 8628): la CLI muestra un
código (`BCDF-GHJK`) y abre el admin (`https://hermes.pow.la/admin/cli`).
Entrás con tu usuario, verificás que el código coincida, **marcás las
cuentas (marcas) en las que puede operar la CLI** y autorizás. La CLI espera
respetando el intervalo que pide la API y, al entrar, muestra las cuentas
autorizadas. Para sumar otra cuenta, `hermes login` de nuevo y marcala.

- La CLI nunca ve tu contraseña ni tu sesión del admin: recibe un token propio
  (`hct_…`) que sólo sirve para `/api/cli/**`, dura 30 días (7 si sos staff
  de POW) y se revoca con `hermes logout`, desde el admin (sesiones de la
  CLI) o solo, si cambiás la contraseña o el 2FA. Te llega un mail cada vez
  que se autoriza una sesión; máximo 10 por cuenta (la 11 revoca la más
  vieja).
- **Aprobá sólo si vos corriste `hermes login` recién**: si alguien te manda
  un link de `/admin/cli` que no pediste, es phishing.
- Se guarda en `~/.config/hermes/credentials.json` (permisos 600; respeta
  `XDG_CONFIG_HOME` y `HERMES_CONFIG_DIR`). Una sesión por API.
- Otra API: `hermes login --api <url>` (o `HERMES_API=…`). La última API
  usada queda como default.

### `hermes logout`

Revoca el token de la CLI en la API y lo borra local.

### `hermes whoami [--json]`

Tu usuario y las marcas **autorizadas en esta sesión** (las que marcaste al
aprobar el login y a las que seguís teniendo acceso), con tu rol y si podés
linkear.

### `hermes link [opciones]`

Linkea la carpeta actual a una marca:

1. Elegís la marca (sólo aparecen aquellas en las que sos admin), o `--tenant`.
2. Nombre del proyecto: `--name`, o el `name` del `package.json`, o la carpeta.
3. La API crea **tus tokens de desarrollo**: un **público** `pst_`
   (`<proyecto> · dev · <tu email>`, con `localhost` para CORS) y uno
   **privado** `psk_` (`… (servidor)`, scopes `checkout_sessions:read` +
   `webhooks:manage`, vinculado al público). Son personales: dejan de valer
   si te sacan el acceso a la marca.
4. Se escriben las variables `HERMES_*` en `.env` y el link en
   `.hermes/project.json` (sin secretos ni nada tuyo: commitealo, lo usa el
   equipo y el CI).

| Opción | |
|---|---|
| `--tenant <marca>` | sin elegir de la lista |
| `--name <nombre>` | nombre del proyecto (1–60 caracteres) |
| `--domain <host>` | dominio del storefront, repetible: a dónde puede volver el checkout (`return_url`/`cancel_url`) y desde dónde se acepta CORS. |
| `--no-private` | sólo el token público |
| `--revalidate-url <url>` | crea el webhook `storefront/revalidate` y escribe `HERMES_REVALIDATE_SECRET` |
| `--env-file <archivo>` | otro archivo en lugar de `.env` |
| `--yes` | no preguntar |

**El link nunca toca la tienda publicada.** La tienda deployada en Hermes
usa los tokens del proyecto, que maneja Hermes (no salen a ningún `.env`).
Linkear un proyecto que ya existe (otro developer, otra máquina) crea TUS
tokens de desarrollo y no pregunta nada. Si ya tenías tokens de desarrollo de
ese proyecto, se rotan (una copia por persona y proyecto: tu otra copia
necesita `hermes env pull --rotate`). Los de otros developers, los de la
tienda y los de Pow no se tocan nunca. Topes: 20 proyectos activos por marca
por cuenta, 50 por marca.

### `hermes env pull [--rotate]`

Deja el `.env` al día con el proyecto linkeado. Sin `--rotate` verifica que
los tokens del `.env` sigan vigentes (y actualiza `HERMES_TENANT`/
`HERMES_API_URL`); si falta o está revocado alguno, te dice que uses
`--rotate`, que emite **tus** tokens de desarrollo nuevos (como un re-link).

### `hermes unlink [--revoke]`

Saca las `HERMES_*` del `.env` y el `.hermes/project.json`. Con `--revoke`
también revoca tus tokens de desarrollo del proyecto (nunca los de la tienda
ni los de otros).

### `hermes tokens [list] [--all]` · `tokens revoke <id>` · `tokens rotate --runtime`

Los tokens de la marca: los de la tienda publicada (Hermes), los de
desarrollo (los tuyos, marcados) y los que te dio Pow / links anteriores; `revoke`
revoca uno tuyo. `tokens rotate --runtime [--environment production|preview]
[--yes]` rota los de **la tienda publicada** (admin de la marca o staff):
Hermes emite los nuevos, re-deploya la versión activa con ellos y recién
después revoca los anteriores (la tienda no se cae; si el re-deploy falla,
los anteriores siguen hasta el próximo `hermes deploy`).

### `hermes deploy-token create [--environment production|preview]` · `list` · `revoke <id>`

Un token para deployar el proyecto desde CI (`hdt_…`, admin de la marca): se
muestra una vez; cargalo como secreto `HERMES_DEPLOY_TOKEN`. Con esa variable,
`hermes deploy` no necesita `hermes login`. Sólo sirve para deployar ese
proyecto de esa marca (y ese entorno, si lo pasaste). Ejemplo de GitHub
Actions en la [guía para agencias](https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/guia-agencias.md#trabajar-en-equipo).

### `hermes dev [--port 3000] [--open] [--no-check] [--yes]`

Levanta el server de desarrollo del proyecto (el script `dev:next` del
`package.json`, o `dev` en proyectos viejos, con `PORT`), al estilo
`shopify hydrogen dev`:

1. Verifica que la carpeta esté linkeada (`.hermes/project.json`) y que los
   tokens del `.env` sigan vigentes (la misma verificación que `env pull`).
   Si no, te dice cómo arreglarlo: `hermes env pull --rotate` o `hermes link`.
   `--no-check` saltea la verificación (sin conexión o sin login).
2. Detecta el gestor de paquetes por el lockfile (npm, pnpm, yarn, bun) y, si
   faltan `node_modules`, ofrece instalarlas (`--yes` sin preguntar; sin
   terminal interactiva hace falta `--yes`).
3. Corre `<gestor> run dev:next` (o `dev`) con las `HERMES_*` del `.env` (o `--env-file`)
   inyectadas (las de la terminal mandan), reenvía la salida y Ctrl+C.
4. Imprime la URL local, la marca, el entorno (producción u otra API, con su URL) y
   links a la home, una categoría de la marca y el carrito. `--open` abre el
   navegador cuando el server contesta.

### `hermes preview [--port 3000] [--open]`

Build de producción + start local (scripts `build` y `start`), con las mismas
verificaciones. Si el build falla, no arranca.

Los dos fallan con un mensaje claro si falta el script (`dev:next`/`dev`, o
`build` y `start`).

**Sin bucles.** En el starter, `"dev": "hermes dev"`, `"preview": "hermes
preview"` y `"deploy": "hermes deploy"` son la CLI, y Next queda en
`"dev:next": "next dev"`, `"build": "next build"` y `"start": "next start"`.
La CLI nunca corre un script que la llame a ella (`hermes dev|preview|deploy`,
`npx --no hermes …`, `npx @hermesecommerce/cli …`): si `dev` es `hermes dev` y no
hay `dev:next`, corre `next dev` directo (y lo mismo con `build`/`start` en
`preview`); si el proyecto no es Next.js, error claro. Además marca sus
procesos hijos (`HERMES_CLI_CADENA`) y corta si un comando se llama a sí mismo
por un camino indirecto.

### `hermes deploy [--preview] [--branch x] [--no-build] [--yes]`

Publica la tienda en el **hosting de Hermes** (el Cloudflare de Pow, como
Shopify Oxygen), si el plan de la marca lo incluye. **Nunca usa un token de
Cloudflare**: hace el build en tu máquina, se lo sube a la API de Hermes y
Hermes lo publica.

1. Verifica el link y, con git, que el deploy activo del entorno sea de un
   commit que está en tu branch (si no, o si tenés cambios sin commitear,
   avisa quién deployó, cuándo y desde qué commit, y pide confirmación;
   `--yes`/`--force` siguen igual). Con `HERMES_DEPLOY_TOKEN` (CI) no hace
   falta login.
2. Si faltan, crea `open-next.config.ts` y `wrangler.jsonc` (el starter ya
   los trae) y ofrece instalar `@opennextjs/cloudflare` y `wrangler`
   (devDependencies; `--yes` sin preguntar).
3. Build: `opennextjs-cloudflare build` + `wrangler deploy --dry-run --outdir
   .hermes/build/worker` (sólo empaqueta; OpenNext corre el script `build`
   del proyecto, que tiene que ser `next build` y no la CLI), sin ninguna variable
   `CLOUDFLARE_*`. **Los secretos no entran al build**: @opennextjs/cloudflare
   compila los archivos `.env*` dentro del worker, así que la CLI los aparta
   mientras corre (en `.hermes/build/env-apartado/`; vuelven al terminar,
   aunque el build falle o se corte) y le pasa las variables del `.env` por
   el entorno **sin** `HERMES_PRIVATE_TOKEN` ni `HERMES_REVALIDATE_SECRET`.
   Si igual aparecen en el worker empaquetado, aborta sin subir nada. Agrega
   `.open-next/`, `.wrangler/` y `.hermes/build/` a tu `.gitignore`.
4. Sube el manifest (con el commit, la branch y si estaba sucio), los
   assets que Hermes no tiene (por hash) y el worker. **Tus tokens no
   viajan**: la tienda lleva los del proyecto, que pone Hermes como
   secretos del worker (y, si la tienda tiene `/api/hermes/revalidate`, el
   secreto del webhook de revalidación que también maneja Hermes). El build
   usa el `pst_` de la tienda, no el tuyo.
5. Muestra la URL: `https://<proyecto>--<marca>.hermescdn.app` en producción,
   `https://<branch>--<proyecto>--<marca>.hermescdn.app` con `--preview` (la
   branch de git, o `--branch`).

`--no-build` sube el último build sin volver a correrlo.

### `hermes deployments [--json]` · `hermes deployments rm` · `hermes rollback <id> [--yes]`

El historial de deploys del proyecto (● activo, ○ reemplazado, ✘ falló, con
commit, branch y quién deployó) y la vuelta a la versión de un deploy
anterior (se vuelve a subir ese bundle con los tokens vigentes de la tienda). Sin terminal interactiva, `rollback` pide `--yes`.
`hermes deployments rm [--branch x] [--yes]` borra la preview de una branch
(la de git por default): libera su URL y deja de contar para el tope de
previews del plan.

### `hermes domains add <dominio> [--checkout-subdomain] [--wait]` · `list` · `remove`

Conecta tu dominio a la tienda hosteada: `www.<dominio>` (un apex se conecta
como `www.`). El checkout hosteado de la marca se sirve en el **mismo
dominio**, `https://www.<dominio>/checkout/...` (lo rutea Pow: tu tienda no
puede usar `/checkout*` ni `/rails-api/v2/{cart,checkout,geo,users}`; poné tu
carrito en otra ruta, p. ej. `/carrito`). Te muestra los registros a cargar en
tu DNS (CNAME → `fallback.hermescdn.app` + los TXT de validación del
certificado); `--wait` sondea cada 15 s hasta que queden activos
(`--timeout <s>`, default 900). `list` muestra el estado (pendiente / activo /
error) y `remove` lo saca (con `--yes` sin terminal).

Para un `www.<dominio>` también muestra, como **opcional**, el registro del
dominio sin www: `A <dominio>` (y `AAAA`) a la IP del redirector de Pow, para
que `<dominio>` redirija a `www.<dominio>` con su propio certificado. Las IPs
las manda la API.

`--checkout-subdomain` suma además `checkout.<dominio>` (opt-in): para el caso
de un front hosteado afuera de Pow (Vercel, etc.) que quiere el checkout bajo
su dominio. `--no-checkout` de versiones anteriores se acepta y es el default.

### `hermes mail-domains add|list|verify|remove <dominio>` · `hermes mail-sender set <email|pow>`

Los mails al comprador (compra, pedido, ruleta, reseñas) salen por defecto
de la dirección de Pow con el nombre de tu marca y `Reply-To` a tu email: no
hay que configurar nada. Para que salgan desde tu dominio, `mail-domains add`
crea la identidad en SES y te muestra los registros: 3 CNAME de DKIM, el MX y
el TXT (SPF) de `bounce.<dominio>`, y un DMARC recomendado. `list` muestra
con qué remitente salen hoy y el estado de cada dominio (pendiente /
verificado / error; se re-chequea solo, `verify` lo fuerza). Cuando
verifica: `hermes mail-sender set ventas@<dominio> [--reply-to <email>]
[--name <nombre>]`; `hermes mail-sender set pow` vuelve a la dirección de
Pow. Si el dominio se desverifica, los mails vuelven solos a Pow hasta que
vuelva a verificar. Pide ser admin de la marca.

## Errores comunes

| Mensaje | Qué hacer |
|---|---|
| `No estás logueado en …` | `hermes login` (con el mismo `--api`) |
| `Tu sesión de la CLI venció o se revocó` | `hermes login` |
| `Tu rol en <marca> … no alcanza` | pedile a un admin de la marca el rol admin, o que linkee él |
| `No tenés acceso a la marca` | `hermes whoami` para ver las tuyas |
| `Esta sesión de la CLI no tiene acceso a <marca>` | `hermes login` y marcá esa cuenta al autorizar |
| `Para rotar sin terminal interactiva, pasá --yes` | en CI, `hermes link … --yes` |
| `Esta carpeta no está linkeada…` (dev/preview) | `hermes link` |
| `Los tokens del proyecto no están al día` (dev/preview) | `hermes env pull --rotate` (o `hermes link`) |
| `Tu package.json no tiene el script "dev:next" ni "dev"` | agregalo (`"dev:next": "next dev"`) |
| `El script "dev" … llama a la CLI de Hermes … bucle` | sumá `"dev:next": "next dev"` (o el de tu framework) |
| `El script "build" … llama a la CLI de Hermes` (deploy) | dejá `"build": "next build"` y publicá con `"deploy": "hermes deploy"` |
| `hermes <comando> se está llamando a sí mismo` | revisá que `dev:next`, `build` y `start` corran tu framework, no la CLI |
| `El plan de <marca> no incluye el hosting de Hermes` (deploy/domains) | pedíselo a Pow, o deployá en tu hosting |
| `El hosting de Hermes … todavía no está habilitado` | todavía no está prendido en esa API |
| `Faltan las herramientas del build` | `npm install -D @opennextjs/cloudflare wrangler` o `hermes deploy --yes` |
| `… ya es de otro cliente` / `… es de Pow` (domains) | ese dominio no se puede conectar a esta marca |

## Desarrollo

```bash
cd packages/cli
npm ci
npm run typecheck && npm test && npm run build
node scripts/smoke-dist.mjs     # corre dist/index.js (--help, --version)
```

Sin dependencias de runtime (parser de argumentos propio, `fetch` nativo).
Cómo funciona el login y qué puede hacer cada token: [`docs/cli.md`](https://github.com/PowEcommerce/hermes-storefront/blob/main/docs/cli.md).
CI: `.github/workflows/ci.yml`.

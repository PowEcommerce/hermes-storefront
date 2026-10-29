# La CLI `hermes`: login, tokens y permisos

Qué hace por detrás `@hermesecommerce/cli` y qué puede tocar cada token. El
detalle de cada comando está en el
[README de la CLI](../packages/cli/README.md); el recorrido completo de una
agencia, en la [guía para agencias](./guia-agencias.md).

## Recorrido

```bash
npm install -g @hermesecommerce/cli    # 1. una sola vez por máquina (como `@shopify/cli`)
hermes create mi-marca                 # 2. = npm create @hermesecommerce/store mi-marca
                                       #    (--template skeleton: lo mínimo; default demo, la tienda de ejemplo)
cd mi-marca                            # 3.
hermes login                           # 4. tu usuario del backoffice (una vez por máquina)
hermes link                            # 5. elegís la marca → su proyecto + tokens HERMES_* en .env
hermes dev                             # 6. http://localhost:3000 con los datos de la marca
hermes deploy                          # 7. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 8. tu dominio (o desde el admin: Configuración → Dominios)
```

La tienda trae la CLI como devDependency: la versión queda fija por proyecto
y el CI la usa sin instalar nada (`npm run hermes -- <comando>`). Si tu `hermes` global es
de otra versión, avisa y corre la del proyecto.

En la tienda, los scripts del `package.json` son la CLI (`"dev": "hermes
dev"`, `"preview": "hermes preview"`, `"deploy": "hermes deploy"`) y Next
queda con otro nombre (`"dev:next": "next dev"`, `"build": "next build"`,
`"start": "next start"`). La CLI nunca corre un script que la llame a ella:
`hermes dev` corre `dev:next`, `hermes preview` corre `build` + `start` y
`hermes deploy` deja que `@opennextjs/cloudflare` corra `build`.

> **Ojo:** El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero. Nunca uses `npx hermes`: dentro de la tienda,
> `npm run hermes -- <comando>`; fuera, `npx @hermesecommerce/cli@^0 <comando>`.

**Regla de oro: la CLI no te da más poder que el backoffice.** Entra con tu
mismo usuario y sus mismos accesos.

## Login: OAuth 2.0 Device Authorization Grant (RFC 8628)

`hermes login` funciona como `gh auth login`:

1. La CLI pide un código a la API (`POST /api/cli/device/code`) y te muestra
   uno de 8 letras (`BCDF-GHJK`).
2. Abre el backoffice en `https://hermes.pow.la/admin/cli?code=BCDF-GHJK`
   (con `--no-browser`, sólo te muestra el link). Ahí, logueado con tu
   usuario, ves el pedido y **elegís en qué marcas puede operar esa sesión**
   (sólo las que administrás).
3. Mientras tanto, la CLI consulta (`POST /api/cli/device/token`) hasta que
   aprobás o rechazás. Al aprobar recibe un token de sesión `hct_…` y te llega
   un mail de aviso.

> **Sólo aprobá un pedido si vos corriste `hermes login` recién.** Si alguien
> te manda un link de aprobación, no lo apruebes: le estarías dando acceso a
> tus marcas. La pantalla te muestra el dispositivo (lo informa el propio
> dispositivo, no está verificado) y avisa si el pedido viene de otra red.

## Un proyecto por tienda

Una marca tiene, por lo general, **un solo proyecto** (su storefront), y
varios developers trabajan sobre él, como en Hydrogen/Oxygen:

- `hermes link` pide a la API los proyectos de la marca (`GET
  /api/cli/tenants/<marca>/projects`) y, si hay uno, **linkea ése sin
  preguntar el nombre**. Si hay varios, elegís de la lista (URL de producción
  y fecha del último deploy); «Crear un proyecto nuevo» aparece sólo si el
  plan tiene lugar. Si no hay ninguno, pregunta el nombre y lo crea.
- Cuenta como proyecto uno con deploys en el hosting (son los que cuenta el
  plan) o, en una marca sin hosting, uno que tiene tokens de storefront
  vigentes. Listar no pide ser admin: alcanza con tener acceso a la marca.
- `hermes link --name <proyecto>` fuerza uno. Si no existe y el plan ya
  llegó a su tope, falla en el link con el nombre del que existe, no en el
  `hermes deploy`.
- Si `.hermes/project.json` apunta a un proyecto que la marca no tiene, el
  link avisa y ofrece cambiarlo.
- **Cada uno en su branch**: `hermes deploy --preview` publica tu branch en
  su URL de preview, sin tocar producción. **Producción** sale de `main`
  desde CI con un token de deploy (`hermes deploy-token create`; ver
  [Trabajar en equipo](./guia-agencias.md#trabajar-en-equipo)).
- Con una API anterior (sin la lista), `hermes link` pregunta el nombre como
  antes.

## Los tokens

| Token | Qué es | Dónde vive | Cuánto dura |
|---|---|---|---|
| `hct_…` | Tu sesión de la CLI | `~/.config/hermes/credentials.json` (permisos `600`) | 30 días (hasta 10 sesiones por usuario: la 11ª revoca la más vieja) |
| `pst_…` / `psk_…` de desarrollo | Tus tokens de storefront para trabajar en local | El `.env` del proyecto (lo escribe `hermes link`) | Mientras puedas administrar la marca |
| `pst_…` / `psk_…` de la tienda | Los de la tienda publicada en el hosting de Hermes | Sólo en Hermes y como secretos del worker | Hasta que se roten |
| `hdt_…` | Token de deploy para CI | El secreto `HERMES_DEPLOY_TOKEN` de tu CI | Hasta que se revoque |

- **`hct_`** sólo sirve para los comandos de la CLI, no para el backoffice
  ni para la Storefront API. Se revoca con `hermes logout`, desde el
  backoffice (sesiones de la CLI) y solo, si cambiás la contraseña, el 2FA o
  el email, o si te desactivan el usuario.
- **Tokens de desarrollo (`hermes link`)**: personales, por proyecto. El
  público trae `localhost` entre sus dominios (CORS desde
  `http://localhost:<puerto>`). Volver a linkear el mismo proyecto **rota los
  tuyos** (nunca los de otra persona ni los de la tienda publicada). Si te
  sacan el acceso a la marca, dejan de valer en menos de un minuto.
  `hermes env pull --rotate` y `hermes unlink --revoke` sólo tocan los tuyos.
- **Tokens de la tienda**: los emite y guarda Hermes por proyecto y entorno,
  y llegan al worker como secretos (nunca en el código ni en un `.env`).
  `hermes tokens rotate --runtime` los rota sin cortar la tienda: Hermes
  re-deploya con los nuevos y recién después revoca los anteriores.
- **`hdt_`** (`hermes deploy-token create`, se muestra una vez): sólo sirve
  para deployar ese proyecto de esa marca (y ese entorno, si lo creaste con
  `--environment production|preview`). No sirve para dominios, rollbacks,
  rotar tokens ni crear otros tokens de deploy.

## Permisos

`hermes link`, `deploy`, `domains`, `logs`, `env`, `tokens` y `mail-*` piden
ser **admin de la marca** y que la marca esté **autorizada en tu sesión** (la elegiste al
aprobar el `hermes login`). Un token de deploy (`hdt_`) reemplaza esos
permisos sólo para deployar su proyecto: no sirve para `hermes logs` ni
`hermes env`.

Los logs piden lo mismo que deployar porque pueden tener datos de tus
compradores (lo que tu código escriba con `console.log`): los ve quien puede
publicar la tienda, no cualquier rol de la marca.

| Respuesta | Qué pasa | Qué hacer |
|---|---|---|
| `401` «corré `hermes login`» | La sesión venció o se revocó | `hermes login` |
| `403` «No tenés acceso a esta marca» | Tu usuario no tiene acceso a la marca | `hermes whoami` para ver las tuyas |
| `403` «Tu rol en esta marca no alcanza» | Tenés acceso pero no sos admin | Pedile el rol a un admin de la marca |
| `403` `cuenta_no_autorizada` | No autorizaste esa marca al aprobar el login | `hermes login` y marcala |
| `403` `hosting_no_habilitado` | El plan de la marca no incluye el hosting | Pedíselo a Pow, o deployá en tu hosting |
| `409` | El nombre del proyecto o el host ya son de otra marca, o hay otra operación en curso | Cambiá el nombre del proyecto o reintentá |
| `413` | El build supera el tamaño permitido | Achicá los assets |
| `429` | Rate limit | Esperá lo que diga `Retry-After` |

## Hosting: qué pasa en `hermes deploy`

1. La CLI corre el build en tu máquina con `@opennextjs/cloudflare` y lo
   empaqueta con `wrangler deploy --dry-run` (no habla con Cloudflare: no
   necesitás cuenta ni token). Corre wrangler con
   `WRANGLER_SEND_METRICS=false` (sin telemetría), salvo que la hayas
   configurado vos.
2. Lo construye **sin tus `.env*`** y sin `HERMES_PRIVATE_TOKEN` ni
   `HERMES_REVALIDATE_SECRET` en el entorno, y aborta si encuentra alguno de
   tus secretos en el bundle (OpenNext compila los `.env*` dentro del worker).
3. Sube el bundle a la API de Hermes; sólo se suben los assets que no estaban.
4. Hermes lo publica con los tokens de la tienda como secretos, tus
   variables de entorno (`hermes env`) y, si la tienda tiene
   `app/api/hermes/revalidate`, crea el webhook de purga.

- Las tiendas corren aisladas, con límites de CPU y de subpedidos, y sin
  acceso a redes internas.
- **Previews** por branch (`hermes deploy --preview`), con su propia URL.
- **Rollback** (`hermes rollback <n>`): vuelve a publicar la versión guardada
  de ese deploy, con los tokens vigentes de la tienda.
- `hermes deploy` avisa si el deploy activo es de un commit que no está en tu
  branch o si tenés cambios sin commitear (en CI: `--yes`).

## Variables de entorno: `hermes env`

Como en Oxygen o Vercel: tus claves (analytics, un CMS…) por proyecto y
entorno (`production`, o `preview` para todas las branches). Hermes las pone
en el worker en cada deploy.

- **Cifradas** en Hermes. Las **secretas** (`--secret`) nunca vuelven en
  claro: ni en `hermes env list` (salen enmascaradas), ni en el build, ni en
  `hermes env pull`. En el worker van como secretos; las normales, como texto
  plano.
- **Cambiar una variable no redeploya**: se aplica en el próximo
  `hermes deploy` (también un rollback o una rotación de tokens usan las
  variables de ese momento).
- **Build**: `hermes deploy` pone las normales en el entorno del build (las
  `NEXT_PUBLIC_*` se compilan ahí) y saca las secretas aunque estén en tu
  `.env` o en tu shell; si el valor local de una secreta quedó en el bundle,
  aborta. Por eso una `NEXT_PUBLIC_*` no puede ser secreta.
- **Reglas**: nombre `^[A-Z][A-Z0-9_]{0,63}$`; no se pueden usar `HERMES_*`,
  `CF_*`, `CLOUDFLARE_*` ni `ASSETS` (son de Hermes y de Cloudflare); hasta
  50 por proyecto y entorno; hasta 5 KB por valor; una secreta no pasa a
  normal sin borrarla antes.
- **Local**: `hermes env pull` baja las normales a tu `.env` para
  `hermes dev`; las secretas las cargás vos.

## Logs: `hermes logs`

Los pedidos (método, path, status, duración), tus `console.log` /
`console.error` y las excepciones de la tienda publicada. Hermes los lee de
Workers Logs de Cloudflare y te los pasa: la CLI no habla con Cloudflare.

- **En vivo** por defecto: pide los nuevos cada 3 s, hasta 15 minutos (o
  Ctrl+C). `--since 1h` muestra también los recientes (hasta 7 días);
  `--no-follow` muestra y sale.
- Filtros: `--preview [--branch x]`, `--status error|ok` (error = 5xx,
  excepción o `console.error`; se ve el pedido entero), `--search <texto>`.
  `--json`: un evento por línea.
- **Sólo tus scripts**: Hermes verifica que el proyecto y el entorno sean de
  la marca antes de consultar, y filtra del lado del server.
- **Datos sensibles**: los headers `cookie`, `authorization`,
  `x-storefront-private-token` (y los que tienen token/secret/session en el
  nombre) llegan como `[filtrado]`; lo mismo los tokens de Hermes y los
  `Bearer …` que aparezcan en tus mensajes. Igual, no loguees datos de tus
  compradores.
- Se guardan 7 días. Una tienda deployada antes de que existiera `hermes
  logs` empieza a tener logs en su próximo `hermes deploy`.

Dominios, checkout en tu dominio y los mails de la marca: en la
[guía para agencias](./guia-agencias.md#deploy-en-hermes).

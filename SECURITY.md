# Seguridad

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad en el SDK (`@hermesecommerce/storefront`), la
CLI (`@hermesecommerce/cli`), el generador (`@hermesecommerce/create-store`),
el starter o en la Storefront API de Hermes, **no abras un issue público**.

Escribinos a **martin@pow.la** con:

- qué encontraste y dónde (paquete y versión, archivo, endpoint);
- cómo reproducirlo (pasos, un ejemplo mínimo);
- el impacto que ves (qué podría hacer alguien con eso).

También podés usar el reporte privado de GitHub: pestaña **Security** →
**Report a vulnerability**.

Te respondemos en 3 días hábiles. Te avisamos cuando esté arreglado y, si
querés, te mencionamos en el release.

## Versiones con soporte

Arreglamos la última versión publicada de cada paquete. Si usás una más
vieja, actualizá.

## Si se filtra un secreto, se rota

Un token o un secreto que llegó a un commit, a un issue, a un log o a un
tarball publicado **se considera comprometido**, aunque lo borres enseguida:
la historia de git, los forks, los caches y npm lo conservan. **Borrarlo no
alcanza: hay que rotarlo.**

| Qué se filtró | Qué hacer |
|---|---|
| Token privado de storefront (`psk_…`) o público (`pst_…`) | `hermes tokens revoke <id>` (o pedile a Pow que lo revoque) y `hermes env pull --rotate` / `hermes link` para tener uno nuevo |
| Tokens de la tienda publicada | `hermes tokens rotate --runtime` |
| Token de deploy (`hdt_…`) | `hermes deploy-token revoke <id>` y crear otro |
| Sesión de la CLI (`hct_…`) | revocala desde el backoffice (sesiones de la CLI) y `hermes login` de nuevo |
| Secreto de un webhook (`whsec_…`) | rotalo (`POST /api/v2/webhook_subscriptions/{id}/rotate_secret`) |
| Token de npm u otro secreto del repo | revocalo en su servicio, creá otro y reemplazá el secreto en GitHub |

Después de rotar, sí: sacalo del repo. Si llegó a un paquete publicado en npm,
publicá una versión nueva sin él y deprecá la afectada.

## El paquete correcto: `@hermesecommerce/cli`

El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero. Nunca
corras `npx hermes`: fuera de un proyecto con la CLI instalada, npm baja y
ejecuta ese paquete ajeno. Usá `npm install -g @hermesecommerce/cli`, los
scripts de la tienda (`npm run hermes -- <comando>`) o
`npx --prefer-online @hermesecommerce/cli@latest <comando>` (con un rango como `@^0`, npx reusa la copia vieja que tenga en caché; `--prefer-online` + `` lo obliga a preguntarle a npm).

## Cómo lo prevenimos

- Cada PR y cada push corren [gitleaks](https://github.com/gitleaks/gitleaks)
  y un chequeo propio de referencias internas
  ([`.github/workflows/secretos.yml`](.github/workflows/secretos.yml)).
- Los paquetes se publican desde GitHub Actions, con provenance de npm, y el
  tarball se revisa antes de publicarse
  ([`docs/publicar.md`](docs/publicar.md)).
- Los `.env*` están en el `.gitignore` (salvo los `.env.example`, sin valores).

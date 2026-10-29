# Publicar en npm

Tres paquetes de este repo se publican en npm, en la org
[`hermesecommerce`](https://www.npmjs.com/org/hermesecommerce), con licencia MIT:

| Carpeta | Paquete | Tag |
|---|---|---|
| `packages/storefront/` | `@hermesecommerce/storefront` | `storefront-v<versión>` |
| `packages/cli/` | `@hermesecommerce/cli` | `cli-v<versión>` |
| `packages/create-store/` | `@hermesecommerce/create-store` (template = `starter/`) | `create-store-v<versión>` |

Publica el workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).
Nadie publica desde su máquina.

## Qué hace el workflow

1. Se dispara con el push de un tag (`storefront-v*`, `cli-v*`,
   `create-store-v*`) o a mano (`workflow_dispatch`, con el paquete y
   `dry_run`, que por default es `true`).
2. Verifica que el tag coincida con la `version` del `package.json` del
   paquete y que esa versión no esté publicada.
3. `npm ci --ignore-scripts` (sólo el lockfile, sin scripts de instalación) y
   los mismos checks del CI: typecheck, tests, build y smoke del `dist/` en
   Node 22 y Node 18 (más `check:generated` en el SDK).
4. `create-store`: verifica con `npm view` que las versiones del SDK y de la
   CLI que pide el template (`VERSIONES_PUBLICADAS` en
   `packages/create-store/src/create.ts`) ya estén en npm.
5. Verifica que el commit esté en `main` (`git merge-base --is-ancestor
   $GITHUB_SHA origin/main`; en una simulación sólo avisa).
6. Arma el tarball (`npm pack`, que corre el `prepack`: build, y en
   `create-store` además la copia de `starter/` en `template/`) y falla si
   lleva algo interno: [`scripts/tarball-sin-internos.sh`](../scripts/tarball-sin-internos.sh)
   (hosts internos, IPs privadas, tokens con valor, access keys de AWS,
   claves PEM, IDs de 32 hex, rutas locales y nombres de marcas). Si aparece
   un falso positivo legítimo se agrega en `EXCEPCIONES` del script, puntual
   y con el porqué.
7. Todo lo anterior corre en el job `build`, sin `id-token` ni secretos, y
   sube el `.tgz` como artifact. El job `publish` (`needs: build`,
   environment `npm`, `id-token: write`) baja ese mismo `.tgz`, verifica su
   sha256 y hace `npm publish <tgz> --access public --provenance` (con
   `dry_run`, `--dry-run`). No vuelve a buildear.
8. **Provenance**: npm guarda una atestación firmada (Sigstore) de qué repo,
   workflow y commit produjo el tarball; se ve en la página del paquete
   («Built and signed on GitHub Actions») y se verifica con
   `npm audit signatures`. Necesita `id-token: write` y que el `repository`
   del `package.json` apunte a este repo (ya lo hace).

Las acciones de GitHub están fijadas por SHA completo (el comentario al lado
dice la versión); Dependabot las actualiza.

## Configurar una vez

1. **2FA** en tu cuenta de npm y exigida en la org (`hermesecommerce` →
   Settings → «Require two-factor authentication»).
2. **Token granular** (mientras no haya trusted publishing, ver abajo):
   npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**:
   - Packages and scopes: **Read and write**, sólo `@hermesecommerce`.
   - **Con vencimiento** (p. ej. 90 días); anotá cuándo vence.
   - «Bypass 2FA» sólo en este token, si npm lo pide para publicar desde CI.
3. **Environment `npm`** en GitHub (Settings → Environments → New
   environment `npm`):
   - Required reviewers: `Martink137`.
   - Deployment branches and tags → «Selected branches and tags» → tag rule
     `*-v*`.
   - Environment secret `NPM_TOKEN` con el token (así sólo el job `publish`
     lo ve). El workflow lo usa como `NODE_AUTH_TOKEN`.

## Pasar a trusted publishing (sin token)

Con trusted publishing, npm acepta la publicación por OIDC desde este
workflow y no hace falta ningún token guardado en GitHub. Requiere que el
paquete ya exista en npm (la primera publicación va con token) y npm CLI
11.5.1 o superior.

1. Por cada paquete, en npmjs.com → el paquete → **Settings** → **Trusted
   Publisher** → **GitHub Actions**:
   - Organization or user: `PowEcommerce`
   - Repository: `hermes-storefront`
   - Workflow filename: `publish.yml`
   - Environment name: `npm`
2. En `publish.yml`, job `publish`:
   - antes de publicar, `npm install -g npm@^11.5.1` (Node 22 trae npm 10);
   - sacá `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` del paso «Publicar».
   - `--provenance` queda: con trusted publishing npm la genera igual.
3. Publicá una versión de prueba (un patch) y verificá en npmjs.com que diga
   «Published via GitHub Actions» con provenance.
4. En cada paquete → Settings → **Publishing access** → «Require two-factor
   authentication and disallow tokens». Desde ahí sólo publica este
   workflow.
5. Borrá el secreto `NPM_TOKEN` del environment y **revocá el token** en
   npmjs.com.

## Sacar una versión

1. **PR con el bump**: subí la `version` del paquete
   (`npm version <patch|minor|major> --no-git-tag-version` dentro de la
   carpeta, que también actualiza el `package-lock.json`). En
   `create-store`, además, `VERSION` en `src/create.ts`; y si cambió la
   versión del SDK o la CLI que tiene que usar una tienda nueva,
   `VERSIONES_PUBLICADAS` (un test verifica que coincidan con los
   `package.json`). Mergeá el PR a `main`.
2. **Tag sobre `main`** (después del merge):

   ```bash
   git checkout main && git pull
   git tag cli-v0.1.1 && git push origin cli-v0.1.1
   ```

3. Aprobá el job `publish` (environment `npm`) y mirá el run en Actions. Si
   falla antes de `npm publish`, no se publicó nada: arreglá, borrá el tag
   (`git push origin :refs/tags/cli-v0.1.1 && git tag -d cli-v0.1.1`) y
   volvé a taggear.

Para probar sin publicar: Actions → «Publicar en npm» → Run workflow, elegí
el paquete y dejá `dry_run` tildado. Un dispatch con `dry_run` destildado
sólo publica si se corre desde el tag del paquete («Use workflow from» → el
tag).

## Primera publicación (orden)

`create-store` genera tiendas que dependen del SDK y de la CLI publicados,
así que van primero:

1. `git tag storefront-v0.1.0 && git push origin storefront-v0.1.0`
2. Con el anterior en verde: `git tag cli-v0.1.0 && git push origin cli-v0.1.0`
3. Con los dos en npm: `git tag create-store-v0.1.0 && git push origin create-store-v0.1.0`

El workflow de `create-store` falla si las versiones que pide el template
todavía no están publicadas. Después, probalo de punta a punta:
`npm create @hermesecommerce/store mi-tienda`.

## Una versión publicada no se reemplaza

npm no deja volver a publicar el mismo número de versión, ni siquiera
después de un `unpublish`. Si salió algo mal:

- Publicá una versión nueva con el arreglo (bump + tag, como siempre).
- Deprecá la mala para que npm avise al instalarla:

  ```bash
  npm deprecate @hermesecommerce/cli@0.1.1 "Usá 0.1.2: <motivo>"
  ```

- Si lo que salió mal es un secreto en el tarball: rotalo primero
  ([`SECURITY.md`](../SECURITY.md)).

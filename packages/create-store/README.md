# @hermesecommerce/create-store

Crea una tienda headless de Hermes (Next.js 16 + `@hermesecommerce/storefront`)
a partir de uno de los dos templates:

- **demo** (el default): [`starter-demo/`](https://github.com/PowEcommerce/hermes-storefront/tree/main/starter-demo),
  una tienda con diseño completo, lista para mostrar (como la demo store de Hydrogen);
- **skeleton**: [`starter/`](https://github.com/PowEcommerce/hermes-storefront/tree/main/starter),
  la misma lógica con lo mínimo de diseño, para armar el tuyo.

```bash
npm create @hermesecommerce/store mi-tienda
# o: pnpm create @hermesecommerce/store mi-tienda · yarn create @hermesecommerce/store mi-tienda
# o, con la CLI global (npm install -g @hermesecommerce/cli): hermes create mi-tienda
npm create @hermesecommerce/store mi-tienda -- --template skeleton
```

0. Si tu versión de Node no es una de las que soportan las dependencias del
   template (22 LTS, o 20/24; `engines` del `package.json`), avisa —«Estás
   con Node 23.7.0; recomendamos Node 22 LTS (o 20/24)»— y sigue.
1. Elige el template: el de `--template`; si no, lo pregunta (con terminal)
   con demo por defecto; sin terminal (CI), demo.
2. Lo copia en `mi-tienda/` (sin `node_modules`, `.next`, `.env` ni lockfile).
3. Le pone el nombre al `package.json` y cambia el SDK y la CLI locales
   (`file:`) por la versión publicada en npm (`^<versión>`). La CLI queda como
   devDependency: versión fija por proyecto, `npm run dev` / `npm run deploy`
   y `npm run hermes -- <comando>` sin instalar nada global.
4. Instala las dependencias con el gestor que usaste (`--no-install` para
   saltearlo e imprimir los comandos).
5. Si tenés la CLI de Hermes logueada (`hermes login`), te ofrece correr
   `hermes link` ahí mismo con la CLI que se acaba de instalar en la tienda
   (`node_modules/.bin/hermes link`; con `--no-install --link`, la publicada con
   versión exacta: `npx --yes --prefer-online @hermesecommerce/cli@<versión> link`). `--link` /
   `--no-link` para no preguntar.
6. Imprime los próximos pasos con la CLI global (`hermes login`, `hermes
   link`, `hermes dev`, `hermes deploy`, `hermes domains add`) y la
   alternativa sin global (`npm run hermes -- <comando>`, `npm run dev`, `npm run deploy`).
   Nunca `npx hermes`: El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero.

| Opción | |
|---|---|
| `--template <demo\|skeleton>` | template (default: demo; con terminal, pregunta) |
| `--no-install` | no instalar dependencias |
| `--pm <npm\|pnpm\|yarn\|bun>` | gestor de paquetes (default: el que corrió el comando) |
| `--link` / `--no-link` | correr (o no) `hermes link` al final sin preguntar |

Para probarlo desde el repo (toma los templates de `starter-demo/` y `starter/` de la raíz):
`cd packages/create-store && npm ci && npm run build && node dist/index.js /tmp/mi-tienda --no-install`

## Desarrollo

```bash
cd packages/create-store
npm ci
npm run typecheck && npm test && npm run build
node scripts/smoke-dist.mjs   # crea una tienda real en un dir temporal
```

Sin dependencias de runtime. Al publicar, `prepack` buildea y copia
`starter-demo/` y `starter/` de la raíz del repo en `templates/demo/` y `templates/skeleton/`
(`.gitignore` viaja como `_gitignore`, porque npm lo borra). El tarball pesa ~100 kB (el CI
falla si pasa de 400 kB). La tienda nueva lleva su propio `.npmrc` con `legacy-peer-deps=true` (viaja como
`_npmrc` por el mismo motivo; el `.npmrc` del template no se copia): npm 10, el de Node 20/22,
falla con vitest 4 al resolver las peers («Cannot read properties of null (reading
'edgesOut')»); npm 11 no lo necesita. Las peers que hacen falta están declaradas en el
`package.json` de cada template. `VERSIONES_PUBLICADAS` en `src/create.ts` tiene la versión del SDK
que se escribe en la tienda nueva (un test verifica que coincida con
`packages/storefront/package.json` y `packages/cli/package.json`). CI: `.github/workflows/ci.yml`.

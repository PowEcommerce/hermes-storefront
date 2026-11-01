# Cómo contribuir

¡Gracias por sumarte! Este repo tiene el SDK, la CLI, el generador de
tiendas y el starter de Hermes. Cada paquete se instala, se prueba y se
publica por separado (no hay workspaces de npm: cada uno tiene su
`package-lock.json`).

```
packages/storefront     @hermesecommerce/storefront    SDK de la Storefront API
packages/cli            @hermesecommerce/cli           CLI `hermes`
packages/create-store   @hermesecommerce/create-store  `npm create @hermesecommerce/store`
starter/                el template que copia create-store
```

## Antes de abrir un PR

Necesitás Node 22 (los paquetes corren en Node 18+, pero el tooling pide 20+).

```bash
# Cada paquete
cd packages/storefront   # o packages/cli, packages/create-store
npm ci
npm run typecheck && npm test && npm run build
node scripts/smoke-dist.mjs
npm run check:generated  # sólo en storefront

# El starter (usa el SDK y la CLI locales: buildealos antes)
(cd packages/storefront && npm ci && npm run build)
(cd packages/cli && npm ci && npm run build)
cd starter && npm ci
npm run typecheck && npm run lint && npm test
HERMES_TENANT=demo HERMES_API_URL=http://127.0.0.1:65535/api npm run build   # sin la API, como el CI

# Que no se cuele nada interno ni un secreto
scripts/tarball-sin-internos.sh --arbol
gitleaks dir . --config .gitleaks.toml   # si tenés gitleaks
```

El CI ([`ci.yml`](.github/workflows/ci.yml) y
[`secretos.yml`](.github/workflows/secretos.yml)) corre lo mismo en cada PR.

### `next build` del starter contra la API real

Por defecto el CI buildea el starter sin la API (un puerto cerrado de
localhost: el prerender usa los fallbacks). Para probarlo además contra
`https://api.pow.la` con una marca de demo, cargá en el repo (Settings →
Secrets and variables → Actions → **Variables**) `HERMES_DEMO_TENANT` y, si
la marca exige token, `HERMES_DEMO_PUBLIC_TOKEN` (un `pst_` es público, pero
igual usá uno sólo para esto). Con la variable, corre el job `starter-api`.

## Reglas

- **Nada interno.** Este repo es público. Ni tokens, ni hosts internos, ni
  nombres de marcas reales en ejemplos y tests: usá `mimarca`, `tu-marca`,
  `tienda.agencia.com`, `ejemplo.test`.
  `scripts/tarball-sin-internos.sh` lo chequea en el CI.
- **La URL de la API no se muestra.** `https://api.pow.la` vive sólo como
  constante interna (`DEFAULT_API_URL` en el SDK, `API_DEFAULT` en la CLI):
  ningún mensaje de la CLI, ni la documentación para agencias (READMEs,
  `docs/`, `site/`), ni lo que se genera (`.env`, `.hermes/project.json`,
  `.env.example` de los templates) la nombra; se dice «Hermes» o «la API de
  Hermes». Los tests y el CI sí pueden usarla.
  `packages/cli/test/sin-url-de-la-api.test.ts` recorre la salida de los
  comandos principales.
- **Otra API (interno).** Para desarrollo interno, la CLI acepta `--api <url>`
  o `HERMES_API=<url>` y el SDK/los templates `apiUrl` / `HERMES_API_URL`. No
  se documentan para agencias.
- **Secretos, nunca.** Los `.env*` están ignorados (salvo `.env.example`,
  sin valores). Si se te escapó uno: [`SECURITY.md`](SECURITY.md) (se rota,
  no alcanza con borrarlo).
- **Tests** para cada cambio de comportamiento.
- **Acciones de GitHub fijadas por SHA completo**, con la versión en un
  comentario (`uses: actions/checkout@<sha> # v4.4.0`). Dependabot las
  actualiza.
- Textos al usuario en español (Argentina).
- Commits: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`.

## La OpenAPI (`packages/storefront/openapi.yaml`)

Los tipos del SDK (`src/generated/schema.d.ts`) y la tabla de caché
(`src/generated/cache.ts`) se generan desde
[`packages/storefront/openapi.yaml`](packages/storefront/openapi.yaml), la
spec de la Storefront API v2. La fuente de verdad es la API: la spec
publicada en `https://api.pow.la/api/v2/openapi.yaml`.

Cuando la API cambia, se actualiza con **un PR**:

```bash
cd packages/storefront
curl -sSf https://api.pow.la/api/v2/openapi.yaml -o openapi.yaml
npm ci
npm run generate          # regenera src/generated/*
npm run check:generated && npm run typecheck && npm test
```

- En el PR, revisá el diff de la spec: si cambió algo que usa un método del
  SDK (`src/client.ts`), ajustalo y sumá tests.
- `servers:` queda **relativo** (`- url: /`, «el mismo host que sirve la
  spec»): la del repo no nombra el host de la API. Si la publicada trae
  `servers:` con URLs, reemplazalos por el relativo antes de `npm run
  generate` (no cambia lo generado). La referencia del sitio (Redoc) los
  muestra sin host (`hideHostname`).
- El CI falla si la spec y lo generado quedaron desfasados.

(Más adelante, un workflow va a abrir ese PR solo cuando cambie la spec
publicada.)

## Versiones y publicación

Para sacar una versión: [`docs/publicar.md`](docs/publicar.md). Nadie
publica desde su máquina.

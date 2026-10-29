# Hermes Storefront

Herramientas para construir el storefront headless de una marca de Hermes
(Pow) con tu propio front: Pow pone el catálogo, el carrito, la cuenta del
comprador, el checkout y los pagos; vos ponés la experiencia.

| Paquete | Para qué |
|---|---|
| [`@hermesecommerce/storefront`](packages/storefront) | SDK TypeScript de la Storefront API v2: cliente tipado, errores normalizados, verificación de webhooks y caché por tags con purga (con un subpath para Next.js). Node 18+, Workers, Edge y navegador. |
| [`@hermesecommerce/cli`](packages/cli) | La CLI `hermes`: login con tu usuario del backoffice, `link` de un proyecto a una marca (tokens en tu `.env`), `dev`, `deploy` al hosting de Hermes, dominios y mails de la marca. |
| [`@hermesecommerce/create-store`](packages/create-store) | `npm create @hermesecommerce/store`: una tienda nueva a partir del starter. |
| [`starter/`](starter) | El template: una tienda Next.js completa (home, categorías con filtros, ficha, búsqueda, carrito con cupón, checkout hosteado, cuenta del comprador y purga de caché). |

## Empezar

```bash
npm install -g @hermesecommerce/cli    # 1. una vez por máquina
hermes create mi-marca                 # 2. = npm create @hermesecommerce/store mi-marca
cd mi-marca
hermes login                           # 3. tu usuario del backoffice
hermes link                            # 4. elegís la marca → tokens HERMES_* en .env
hermes dev                             # 5. http://localhost:3000 con los datos de la marca
hermes deploy                          # 6. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 7. tu dominio
```

Sin instalar nada global: `npm create @hermesecommerce/store mi-marca` y,
dentro de la tienda, `npm run hermes -- login`, `npm run hermes -- link`, `npm run dev` y
`npm run deploy`.

Fuera de una tienda y sin instalar nada global: `npx @hermesecommerce/cli@^0 <comando>`.

> **Ojo:** El comando se llama `hermes`, pero el paquete es `@hermesecommerce/cli`. No instales el paquete `hermes` de npm: es de un tercero.
> Nunca uses `npx hermes`: sin la CLI instalada en el proyecto, baja y ejecuta ese paquete ajeno.

¿Ya tenés tu front? Usá sólo el SDK:

```bash
npm i @hermesecommerce/storefront
```

```ts
import { createStorefrontClient } from '@hermesecommerce/storefront';

const pow = createStorefrontClient({
  publicToken: process.env.HERMES_PUBLIC_TOKEN, // pst_…
  privateToken: process.env.HERMES_PRIVATE_TOKEN, // psk_… (sólo en el servidor)
});

const { items } = await pow.catalog.products({ page_number: 1 });
```

## Documentación

- [Guía para agencias](docs/guia-agencias.md): tokens, catálogo, carrito,
  cuenta, checkout hosteado, webhooks, caché y purga, errores, rate limits y
  el checklist antes de salir a producción.
- [La CLI: login, tokens y permisos](docs/cli.md).
- [SDK](packages/storefront/README.md) · [CLI](packages/cli/README.md) ·
  [create-store](packages/create-store/README.md) · [starter](starter/README.md).
- Referencia de la API (OpenAPI 3.1): `https://api.pow.la/api/v2/openapi.json`
  o [`packages/storefront/openapi.yaml`](packages/storefront/openapi.yaml).

## Contribuir y seguridad

- [CONTRIBUTING.md](CONTRIBUTING.md): cómo correr los checks, cómo se
  actualiza la OpenAPI y las reglas del repo.
- [SECURITY.md](SECURITY.md): cómo reportar una vulnerabilidad (no por un
  issue público).
- [Publicar en npm](docs/publicar.md).

## Licencia

[MIT](LICENSE) © POW SA

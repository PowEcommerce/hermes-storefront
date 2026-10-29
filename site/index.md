---
layout: home
title: Hermes para agencias

hero:
  name: Hermes
  text: Storefronts headless sobre Pow
  tagline: Pow pone el catálogo, el carrito, la cuenta del comprador, el checkout y los pagos. Tu agencia pone la experiencia, con el front que quiera.
  actions:
    - theme: brand
      text: Guía para agencias
      link: /guias/agencias
    - theme: alt
      text: Referencia de la API
      link: /api/
    - theme: alt
      text: SDK TypeScript
      link: /sdk/

features:
  - title: CLI hermes
    details: Login con tu usuario del backoffice, link a la marca, dev local, deploy, dominios y mails, todo desde la terminal.
    link: /guias/cli-comandos
    linkText: Ver comandos
  - title: Storefront API v2
    details: Catálogo, carrito, cuenta del comprador, checkout hosteado, webhooks firmados y caché con purga. OpenAPI 3.1.
    link: /api/
    linkText: Ver la referencia
  - title: SDK TypeScript
    details: '@hermesecommerce/storefront: cliente tipado para Node 18+, Workers, Edge y navegador, con errores normalizados y verifyWebhook.'
    link: /sdk/
    linkText: Ver el SDK
  - title: Hosting de Hermes
    details: Un deploy por branch con URL propia, tu dominio con certificado automático y los mails desde el dominio de la marca.
    link: /guias/agencias#deploy-en-hermes
    linkText: Ver el deploy
---

## De cero a tu dominio en 6 comandos

Con Node 18+ y tu usuario del backoffice de Pow. La CLI se instala una vez por máquina:

```bash
npm install -g @hermesecommerce/cli
```

```bash
hermes create mi-marca                 # 1. una tienda nueva a partir del starter (Next.js)
cd mi-marca
hermes login                           # 2. tu usuario del backoffice
hermes link                            # 3. elegís la marca → tokens HERMES_* en .env
hermes dev                             # 4. http://localhost:3000 con los datos de la marca
hermes deploy                          # 5. publicar en el hosting de Hermes
hermes domains add www.mi-marca.com    # 6. tu dominio
```

::: warning El paquete es @hermesecommerce/cli
El comando se llama `hermes`, pero el paquete de npm es `@hermesecommerce/cli`. No instales el
paquete `hermes` de npm (es de un tercero) y nunca uses `npx hermes`.
:::

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

## Por dónde seguir

- **[Guía para agencias](/guias/agencias):** el recorrido completo, de los tokens al checklist antes de salir a producción.
- **[La CLI](/guias/cli):** login, tokens, permisos y qué pasa en cada deploy.
- **[Dominios propios](/guias/agencias#tu-dominio)** y **[remitente de mails](/guias/agencias#los-mails-de-la-marca-remitente)** de la marca.
- **[Trabajo en equipo y CI](/guias/agencias#trabajar-en-equipo):** un deploy por PR con GitHub Actions.
- **[Referencia de la API](/api/)** y **[ejemplo con Next.js](/sdk/ejemplos)**.

# Changelog de @hermesecommerce/create-store

## 0.3.0

- Las tiendas nuevas piden `@hermesecommerce/cli@^0.3.0` (link sin preguntar
  el nombre del proyecto, `hermes create` sin caché vieja de npx, aviso de
  Node).
- Sin rangos en `npx`: con `--no-install --link`, `hermes link` corre con la
  CLI de **versión exacta** que pide el template
  (`npx --yes --prefer-online @hermesecommerce/cli@0.3.0 link`), y para usar
  la CLI fuera de la tienda sugiere
  `npx --prefer-online @hermesecommerce/cli@latest <comando>` (o
  `npm install -g @hermesecommerce/cli@latest`). Con `@^0`, npx reusaba una
  copia vieja de su caché.
- Avisa (sin cortar) si la versión de Node no es una de las que soportan las
  dependencias del template: «Estás con Node 23.7.0; recomendamos Node 22 LTS
  (o 20/24)». Si lo corre `hermes create`, el aviso sale una sola vez.
- Templates (demo y skeleton):
  - **`/home/preview`**: la vista previa del editor de inicio del admin de
    Hermes (antes daba 404). Dibuja los bloques de la home para el `pb_type`
    pedido y, con `home_version_token`, la versión en borrador (con un cartel
    que lo avisa). Dinámica y sin caché, `noindex`, con el puente de
    `postMessage` del editor (resaltar / elegir bloques).
  - Sólo esa ruta se deja embeber, y sólo desde `https://hermes.pow.la` y
    `https://admin.pow.la` (`frame-ancestors` obligatorio, sin
    `X-Frame-Options`). El resto de la tienda sigue sin dejarse embeber.
  - Home de ejemplo: en `hermes dev` muestra un aviso discreto («Esta es la
    home de ejemplo: cargá la tuya desde el admin (Contenido › Página de
    inicio)»); en producción, no.
  - `engines.node`: `^20.9.0 || ^22.0.0 || >=24.0.0`.

## 0.2.0

- Template demo con diseño completo (`--template demo|skeleton`, demo por
  defecto).

## 0.1.1

- La tienda generada instala con npm 10 (`.npmrc` con `legacy-peer-deps`).

## 0.1.0

- Primera versión.

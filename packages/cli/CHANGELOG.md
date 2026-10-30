# Changelog de @hermesecommerce/cli

## 0.3.0

- `hermes link` ya no pregunta «Nombre del proyecto»: si la marca no tiene
  proyecto, lo crea con el **ID de la marca** (`mi-marca`); si ya tiene uno
  en el hosting, lo reutiliza como antes. Sólo pregunta si elegís «Crear un
  proyecto nuevo» y ya existe uno con ese nombre.
- `hermes link --project <nombre>` para forzar un proyecto (casos raros).
  `--name` sigue andando como alias.
- `hermes create` corre el generador con su **versión exacta**
  (`npx --yes --prefer-online @hermesecommerce/create-store@<versión>`: la
  `latest` de npm si es de la misma major, o la mínima conocida sin red). Con
  el rango `@^0`, npx reusaba una copia vieja de su caché (template y CLI
  viejos).
- README: fuera de un proyecto, `npx --prefer-online @hermesecommerce/cli@latest
  <comando>` (o `npm install -g @hermesecommerce/cli@latest`) en vez de
  `npx @hermesecommerce/cli@^0`, por la misma caché de npx.
- `hermes create`, `dev`, `preview` y `deploy` avisan (sin cortar) si la
  versión de Node no es una de las que soportan las dependencias de la
  tienda: «Estás con Node 23.7.0; recomendamos Node 22 LTS (o 20/24)».

## 0.2.1

- Salida propia de Hermes en `hermes deploy` (pasos, errores claros y el log
  completo en `.hermes/logs/`); `--verbose` y `--json`.

## 0.2.0

- `hermes logs` y `hermes env` (variables de entorno de la tienda).

## 0.1.2

- `hermes link` usa el proyecto que la marca ya tiene en el hosting.

## 0.1.0

- Primera versión: `login`, `link`, `dev`, `preview`, `deploy`, `domains`,
  `tokens`, `deploy-token`, `mail-domains`.

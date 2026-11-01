# Changelog de @hermesecommerce/cli

## 0.3.1

- La CLI ya no muestra la URL de la API: `login`, `logout`, `whoami`, `dev`
  y los errores dicen «Hermes» («entraste como … en Hermes», «No estás
  logueado en Hermes», «Entorno: producción»). `whoami --json` ya no trae
  `api` (salvo con otra API).
- `hermes link` y `hermes env pull` ya no escriben `HERMES_API_URL` en el
  `.env` (el SDK ya trae la API por defecto), y `.hermes/project.json` ya no
  guarda `api`. Los proyectos linkeados antes siguen andando igual.
- `--api` / `HERMES_API` siguen andando (uso interno), pero salen de la ayuda.

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

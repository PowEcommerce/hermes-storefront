#!/usr/bin/env bash
# ============================================================
# La URL de la API de Hermes es interna: no aparece en lo que ve una agencia.
#
#   scripts/sin-url-de-la-api.sh
#
# Busca el host en la documentación para agencias (READMEs, docs/, site/,
# CHANGELOGs), la OpenAPI y los ejemplos, el código de la CLI y del SDK
# (salvo la constante: `API_DEFAULT` en packages/cli/src/context.ts y
# `DEFAULT_API_URL` en packages/storefront/src/client.ts) y los templates
# (starter/, starter-demo/: todo, tests incluidos, porque viajan a la tienda).
# La salida de la CLI la cubre packages/cli/test/sin-url-de-la-api.test.ts.
# Sale 1 (y muestra `archivo:línea: contenido`) si lo encuentra.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

host='api\.pow\.la'
hallado=$(git grep -nIE "$host" -- \
  README.md docs site 'packages/*/README.md' 'packages/*/CHANGELOG.md' \
  packages/cli/src packages/create-store/src packages/storefront/src \
  packages/storefront/openapi.yaml packages/storefront/examples \
  starter starter-demo \
  ':!packages/cli/src/context.ts' ':!packages/storefront/src/client.ts' || true)

if [ -n "$hallado" ]; then
  printf '%s\n' "$hallado"
  echo "::error::La URL de la API aparece en algo que ve la agencia: usá «Hermes» / «la API de Hermes» (ver CONTRIBUTING.md)."
  exit 1
fi
echo "OK: la URL de la API sólo está en las constantes internas."

#!/usr/bin/env bash
# ============================================================
# ¿Algo de este repo (o de un tarball de npm) lleva algo interno de Pow?
#
#   scripts/tarball-sin-internos.sh <carpeta>        el `package/` de un .tgz (o cualquier carpeta)
#   scripts/tarball-sin-internos.sh --arbol          todo el árbol (versionado + nuevo sin ignorar)
#   scripts/tarball-sin-internos.sh --diff <ref>     sólo las líneas agregadas entre <ref> y HEAD
#
# Sale 1 (y muestra `archivo:línea: contenido`) si encuentra:
#   - hosts internos: staging, hosts *.internal, amazonaws.com (hosts de servicios de AWS);
#   - tokens con valor: pst_/psk_/pit_/hct_/hdt_/crt_/whsec_ seguidos de 6+
#     caracteres; access keys de AWS (AKIA…); claves PEM (-----BEGIN);
#   - IPs privadas (10.x, 172.16–31.x, 192.168.x);
#   - IDs de 32 hex (cuentas, zonas y namespaces de Cloudflare);
#   - rutas locales (/Users/, /home/<usuario>/);
#   - nombres de marcas y recursos internos (scripts/nombres-internos.mjs,
#     con la lista hasheada: este repo es público).
#
# Excepciones (falsos positivos legítimos): una regex de Perl por línea en
# EXCEPCIONES; si matchea la línea encontrada (`archivo:línea: contenido`),
# la descarta. Que sean lo más puntuales posible y con el porqué al lado.
# ============================================================
set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)

PATRONES=(
  'staging'
  'amazonaws\.com'
  # Hosts *.internal (foo.internal, foo.internal:5432, "foo.internal"), no
  # propiedades JS que se llaman `internal` (this.internal = …).
  '[A-Za-z0-9-]\.internal([:/"'"'"'`]|$)'
  '(pst|psk|pit|hct|hdt|crt|whsec)_[A-Za-z0-9]{6,}'
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN'
  '(^|[^0-9.])10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '(^|[^0-9.])172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '(^|[^0-9.])192\.168\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '(^|[^0-9A-Fa-f])[0-9a-fA-F]{32}([^0-9A-Fa-f]|$)'
  '/Users/'
  # /home/<usuario>/ como ruta (no un path de la API como /api/v2/home/…)
  '(^|[[:space:]"'"'"'`=(])/home/[a-z][a-z0-9_.-]*/'
)

EXCEPCIONES=(
  # Tokens falsos de los tests: un solo carácter repetido (pst_77777777, hct_aaaaaaaa…).
  '(?:pst|psk|pit|hct|hdt|crt|whsec)_([A-Za-z0-9])\1{5,}(?![A-Za-z0-9])'
)

# Archivos que describen los patrones (los nombran a propósito).
SIN_ESCANEAR='^(\./)?(scripts/tarball-sin-internos\.sh|scripts/nombres-internos\.mjs|\.gitleaks\.toml)$'

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "${1:-}" in
  --arbol)
    cd "$raiz"
    git ls-files -z --cached --others --exclude-standard | { grep -zvE "$SIN_ESCANEAR" || true; } > "$tmp/lista"
    ;;
  --diff)
    base="${2:?uso: $0 --diff <ref>}"
    cd "$raiz"
    # Cada archivo cambiado, con sólo sus líneas agregadas (los números de
    # línea son de ese extracto; el contenido alcanza para ubicarlas).
    git diff --name-only --diff-filter=AMR -z "$base" HEAD -- | { grep -zvE "$SIN_ESCANEAR" || true; } |
      while IFS= read -r -d '' f; do
        mkdir -p "$tmp/diff/$(dirname "$f")"
        git diff -U0 "$base" HEAD -- "$f" | { grep -E '^\+' || true; } | { grep -vE '^\+\+\+ ' || true; } | sed 's/^+//' > "$tmp/diff/$f"
      done
    mkdir -p "$tmp/diff"
    cd "$tmp/diff"
    find . -type f -print0 > "$tmp/lista"
    ;;
  ''|-*)
    echo "uso: $0 <carpeta> | --arbol | --diff <ref>" >&2
    exit 2
    ;;
  *)
    cd "$1"
    find . -type f -print0 > "$tmp/lista"
    ;;
esac

patron=$(IFS='|'; echo "${PATRONES[*]}")
hallado=""
if [ -s "$tmp/lista" ]; then
  hallado=$(xargs -0 grep -nIHE -- "$patron" < "$tmp/lista" || true)
fi
for e in "${EXCEPCIONES[@]+"${EXCEPCIONES[@]}"}"; do
  [ -n "$hallado" ] || break
  hallado=$(printf '%s\n' "$hallado" | EXC="$e" perl -ne 'print unless /$ENV{EXC}/' || true)
done

nombres=""
if [ -s "$tmp/lista" ]; then
  nombres=$(xargs -0 node "$raiz/scripts/nombres-internos.mjs" < "$tmp/lista" || true)
fi

if [ -n "$hallado" ] || [ -n "$nombres" ]; then
  [ -z "$hallado" ] || printf '%s\n' "$hallado"
  [ -z "$nombres" ] || printf '%s\n' "$nombres"
  echo "::error::Hay referencias internas (ver arriba)."
  exit 1
fi
echo "OK: sin referencias internas ($(tr -cd '\0' < "$tmp/lista" | wc -c | tr -d ' ') archivos)."

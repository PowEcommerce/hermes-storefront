// Tipos mínimos de `next/cache` para compilar el subpath `/next` sin tener
// Next instalado (es peerDependency OPCIONAL). En runtime se usa el `next` de
// la app de la agencia. Next 16: `revalidateTag(tag, perfil)`; Next 14/15
// ignoran el segundo argumento.
declare module 'next/cache' {
  export function revalidateTag(
    tag: string,
    profile?: string | { expire?: number; revalidate?: number; stale?: number },
  ): void;
}

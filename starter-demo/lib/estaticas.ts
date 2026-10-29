// Páginas estáticas del backoffice (Contenido → Páginas: envíos, cambios,
// términos…). Se sirven en /info/<path>. Sin imports de servidor: lo usan el
// footer y los tests.

/** La ruta de la tienda para el `path` de una estática del backoffice. */
export const rutaDeEstatica = (path: string) => `/info/${encodeURIComponent(path.replace(/^\/+|\/+$/g, ''))}`;

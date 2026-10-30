// Vista previa del editor de inicio del admin de Hermes (Contenido › Página de
// inicio). El admin la abre en un iframe:
//
//   /home/preview?pb_type=Main%20Store[&home_version_token=<token>]&t=<timestamp>
//
// Dibuja los MISMOS bloques que la home (PageBlocks), con tres diferencias:
//   - dinámica y sin caché: lo que se acaba de guardar se ve en el próximo
//     reload del iframe (nada de ISR ni de la caché de datos);
//   - con `home_version_token`, la versión que todavía no está publicada, con
//     un cartel arriba que avisa que no es lo que ven los clientes;
//   - `noindex`, y es la única ruta que se deja embeber, sólo desde el admin
//     (lib/security-headers.ts, next.config.ts).
// Los parámetros y los orígenes del admin: lib/preview.ts.
import type { Metadata } from 'next';
import { getHomePreview, productsForBlocks } from '@/lib/content';
import { detalleDeError } from '@/lib/errors';
import { pbTypeDelPreview, tokenDeVersion } from '@/lib/preview';
import { PageBlocks } from '@/components/blocks/PageBlocks';
import { PuenteDelEditor } from '@/components/blocks/PuenteDelEditor';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Vista previa',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VistaPrevia({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const pbType = pbTypeDelPreview(params.pb_type);
  const token = tokenDeVersion(params.home_version_token);

  let datos: Awaited<ReturnType<typeof getHomePreview>>;
  try {
    datos = await getHomePreview(pbType, token);
  } catch (e) {
    console.error('[hermes] vista previa de la home:', detalleDeError(e));
    return <Aviso titulo="No se pudo cargar la vista previa" texto="Probá recargar en unos segundos." />;
  }
  const { page, version } = datos;
  const products = page.blocks.length ? await productsForBlocks(page) : [];

  return (
    <>
      {version && (
        <div
          role="status"
          className="pointer-events-none fixed top-2 left-1/2 z-[2000] max-w-[calc(100%-32px)] -translate-x-1/2 truncate rounded-full bg-black/80 px-3 py-1 text-xs text-white shadow"
        >
          Vista previa: <strong>{version.nombre}</strong> · no es lo que ven los clientes
        </div>
      )}
      {page.blocks.length ? (
        <PageBlocks page={page} products={products} />
      ) : (
        <Aviso titulo="Esta página todavía no tiene bloques" texto="Agregá el primero desde el editor de inicio." />
      )}
      <PuenteDelEditor />
    </>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="text-muted-fg">{texto}</p>
    </div>
  );
}

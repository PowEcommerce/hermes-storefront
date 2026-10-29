'use client';

// Errores no esperados (API caída, etc.). Los de negocio se muestran en cada página.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ui-pagina py-24 text-center">
      <h1 className="ui-t-titulo mb-3">Algo salió mal</h1>
      <p className="ui-t-cuerpo mb-8 text-muted-fg">Probá de nuevo en unos segundos.{error.digest && ` (código ${error.digest})`}</p>
      <button type="button" className="ui-boton" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}

'use client';

// Errores no esperados (API caída, etc.). Los de negocio se muestran en cada página.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-20 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Algo salió mal</h1>
      <p className="mb-6 text-muted-fg">Probá de nuevo en unos segundos.{error.digest && ` (código ${error.digest})`}</p>
      <button type="button" className="btn" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}

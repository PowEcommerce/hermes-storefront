import type { Metadata } from 'next';
import { LoginForm } from '../AuthForms';

export const metadata: Metadata = { title: 'Ingresar', robots: { index: false } };

export default async function IngresarPage({ searchParams }: PageProps<'/cuenta/ingresar'>) {
  const { volver } = await searchParams;
  return (
    <div className="ui-pagina mx-auto max-w-md space-y-6 py-16">
      <h1 className="ui-t-titulo">Ingresá a tu cuenta</h1>
      <LoginForm volver={typeof volver === 'string' ? volver : '/cuenta'} />
    </div>
  );
}

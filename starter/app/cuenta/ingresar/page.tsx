import type { Metadata } from 'next';
import { LoginForm } from '../AuthForms';

export const metadata: Metadata = { title: 'Ingresar', robots: { index: false } };

export default async function IngresarPage({ searchParams }: PageProps<'/cuenta/ingresar'>) {
  const { volver } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <h1 className="text-2xl font-semibold">Ingresá a tu cuenta</h1>
      <LoginForm volver={typeof volver === 'string' ? volver : '/cuenta'} />
    </div>
  );
}

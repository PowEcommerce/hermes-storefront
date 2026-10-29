import type { Metadata } from 'next';
import { RegisterForm } from '../AuthForms';

export const metadata: Metadata = { title: 'Crear cuenta', robots: { index: false } };

export default function RegistroPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <h1 className="text-2xl font-semibold">Creá tu cuenta</h1>
      <RegisterForm />
    </div>
  );
}

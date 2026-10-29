import type { Metadata } from 'next';
import { RegisterForm } from '../AuthForms';

export const metadata: Metadata = { title: 'Crear cuenta', robots: { index: false } };

export default function RegistroPage() {
  return (
    <div className="ui-pagina mx-auto max-w-md space-y-6 py-16">
      <h1 className="ui-t-titulo">Creá tu cuenta</h1>
      <RegisterForm />
    </div>
  );
}

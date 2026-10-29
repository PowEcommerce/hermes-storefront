'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ingresar, registrarse, type EstadoForm } from './actions';
import { SubmitButton } from '@/components/SubmitButton';

const inicial: EstadoForm = { error: null };

function Error({ estado }: { estado: EstadoForm }) {
  return estado.error ? (
    <p role="alert" className="text-sm text-danger">
      {estado.error}
    </p>
  ) : null;
}

export function LoginForm({ volver }: { volver: string }) {
  const [estado, accion] = useActionState(ingresar, inicial);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="volver" value={volver} />
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contraseña</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      <Error estado={estado} />
      <SubmitButton className="btn w-full" pendingText="Ingresando…">
        Ingresar
      </SubmitButton>
      <p className="text-center text-sm">
        ¿No tenés cuenta?{' '}
        <Link href="/cuenta/registro" className="underline">
          Creala
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [estado, accion] = useActionState(registrarse, inicial);
  return (
    <form action={accion} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm">
          <span>Nombre</span>
          <input name="first_name" autoComplete="given-name" required className="input" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Apellido</span>
          <input name="last_name" autoComplete="family-name" required className="input" />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contraseña</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={6} className="input" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Repetí la contraseña</span>
        <input name="password_confirmation" type="password" autoComplete="new-password" required className="input" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="terms" required /> Acepto los términos y condiciones
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="suscribe" /> Quiero recibir novedades
      </label>
      <Error estado={estado} />
      <SubmitButton className="btn w-full" pendingText="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
      <p className="text-center text-sm">
        ¿Ya tenés cuenta?{' '}
        <Link href="/cuenta/ingresar" className="underline">
          Ingresá
        </Link>
      </p>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { aplicarCupon, quitarCupon } from '@/app/carrito/actions';
import { SubmitButton } from './SubmitButton';

export function CouponForm({ code }: { code: string | null }) {
  const [estado, accion] = useActionState(aplicarCupon, null);

  if (code)
    return (
      <form action={quitarCupon} className="flex items-center justify-between text-sm">
        <span>
          Cupón <strong>{code}</strong>
        </span>
        <SubmitButton className="text-muted-fg underline" pendingText="Quitando…">
          Quitar
        </SubmitButton>
      </form>
    );

  return (
    <form action={accion} className="space-y-2">
      <label htmlFor="cupon" className="text-sm">
        ¿Tenés un cupón?
      </label>
      <div className="flex gap-2">
        <input id="cupon" name="code" className="input h-10" autoComplete="off" />
        <SubmitButton className="btn-outline h-10" pendingText="…">
          Aplicar
        </SubmitButton>
      </div>
      {estado && !estado.ok && <p className="text-sm text-danger">{estado.message}</p>}
    </form>
  );
}

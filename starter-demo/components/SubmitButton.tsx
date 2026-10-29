'use client';

import { useFormStatus } from 'react-dom';

/** Botón de submit que se deshabilita mientras corre la Server Action del form. */
export function SubmitButton({
  children,
  pendingText,
  className = 'btn',
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

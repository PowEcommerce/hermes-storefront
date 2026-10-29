'use server';

// Server Actions del carrito. El token crt_ vive en una cookie httpOnly: el
// navegador nunca lo ve, sólo llama a estas acciones.
import { revalidatePath } from 'next/cache';
import { hermes } from '@/lib/hermes';
import { borrarCarrito, guardarCarrito, leerCarrito } from '@/lib/cookies';
import { detalleDeError, mensajeDeError } from '@/lib/errors';

export interface ResultadoCarrito {
  ok: boolean;
  message: string;
}

/** Agregar una variante. El primer add crea el carrito y nos da el crt_. */
export async function agregarAlCarrito(variantId: number, quantity = 1): Promise<ResultadoCarrito> {
  if (!Number.isInteger(variantId) || variantId <= 0) return { ok: false, message: 'Elegí una variante.' };
  const qty = Math.min(Math.max(1, Math.trunc(quantity) || 1), 99);
  try {
    const { data, cartToken } = await hermes.cart.addLine(await leerCarrito(), {
      variant_id: variantId,
      quantity: qty,
    });
    if (cartToken) await guardarCarrito(cartToken);
    revalidatePath('/carrito');
    if (data.quantity_added < qty)
      return { ok: true, message: `Sólo quedaban ${data.quantity_added} unidades: agregamos esas.` };
    return { ok: true, message: 'Agregado al carrito.' };
  } catch (e) {
    console.error('[hermes] carrito:', detalleDeError(e));
    return { ok: false, message: mensajeDeError(e, 'No pudimos agregarlo al carrito.') };
  }
}

export async function cambiarCantidad(lineId: number, quantity: number): Promise<ResultadoCarrito> {
  const token = await leerCarrito();
  if (!token) return { ok: false, message: 'Tu carrito venció.' };
  try {
    if (quantity <= 0) await hermes.cart.removeLine(token, lineId);
    else await hermes.cart.updateLine(token, lineId, Math.min(quantity, 99));
    revalidatePath('/carrito');
    return { ok: true, message: '' };
  } catch (e) {
    console.error('[hermes] carrito:', detalleDeError(e));
    return { ok: false, message: mensajeDeError(e, 'No pudimos actualizar el carrito.') };
  }
}

export async function quitarLinea(lineId: number): Promise<ResultadoCarrito> {
  return cambiarCantidad(lineId, 0);
}

export async function aplicarCupon(_prev: ResultadoCarrito | null, form: FormData): Promise<ResultadoCarrito> {
  const code = String(form.get('code') ?? '').trim();
  if (!code) return { ok: false, message: 'Ingresá un código.' };
  const token = await leerCarrito();
  if (!token) return { ok: false, message: 'Agregá algo al carrito primero.' };
  try {
    await hermes.cart.applyCoupon(token, code);
    revalidatePath('/carrito');
    return { ok: true, message: 'Cupón aplicado.' };
  } catch (e) {
    console.error('[hermes] carrito:', detalleDeError(e));
    return { ok: false, message: mensajeDeError(e, 'No pudimos aplicar el cupón.') };
  }
}

export async function quitarCupon(): Promise<void> {
  const token = await leerCarrito();
  if (!token) return;
  try {
    await hermes.cart.removeCoupon(token);
  } finally {
    revalidatePath('/carrito');
  }
}

/** Después de una compra completa: el carrito ya es una orden. */
export async function vaciarCarritoLocal(): Promise<void> {
  await borrarCarrito();
}

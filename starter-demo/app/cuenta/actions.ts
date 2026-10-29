'use server';

// Login, registro y logout del comprador. Los tokens (access 15 min + refresh
// rotativo) quedan en cookies httpOnly; el carrito se asocia a la cuenta.
import { redirect } from 'next/navigation';
import { hermes } from '@/lib/hermes';
import { borrarSesion, guardarSesion, leerCarrito, leerSesion } from '@/lib/cookies';
import { detalleDeError, mensajeDeError } from '@/lib/errors';
import { ipDelComprador } from '@/lib/site';
// Sólo rutas internas (evita open redirects con ?volver=https://…, //… o /\…).
import { destinoSeguro } from '@/lib/redirects';

export interface EstadoForm {
  error: string | null;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim();


export async function ingresar(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = texto(form, 'email');
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Completá email y contraseña.' };
  try {
    const { session } = await hermes.account.login(
      { email, password },
      { cartToken: await leerCarrito() },
      { headers: await ipDelComprador() },
    );
    if (!session) return { error: 'No pudimos iniciar la sesión. Probá de nuevo.' };
    await guardarSesion(session);
  } catch (e) {
    console.error('[hermes] cuenta:', detalleDeError(e));
    return { error: mensajeDeError(e, 'Email o contraseña incorrectos.') };
  }
  redirect(destinoSeguro(texto(form, 'volver')));
}

export async function registrarse(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const body = {
    first_name: texto(form, 'first_name'),
    last_name: texto(form, 'last_name'),
    email: texto(form, 'email'),
    password: String(form.get('password') ?? ''),
    password_confirmation: String(form.get('password_confirmation') ?? ''),
    terms_accepted: form.get('terms') === 'on',
    suscribe: form.get('suscribe') === 'on',
  };
  if (!body.first_name || !body.last_name || !body.email || !body.password)
    return { error: 'Completá todos los campos.' };
  if (body.password !== body.password_confirmation) return { error: 'Las contraseñas no coinciden.' };
  if (!body.terms_accepted) return { error: 'Tenés que aceptar los términos y condiciones.' };
  try {
    const { session } = await hermes.account.register(
      body,
      { cartToken: await leerCarrito() },
      { headers: await ipDelComprador() },
    );
    if (session) await guardarSesion(session);
    else return { error: 'Te registraste. Ahora ingresá con tu email y contraseña.' };
  } catch (e) {
    console.error('[hermes] cuenta:', detalleDeError(e));
    return { error: mensajeDeError(e, 'No pudimos crear tu cuenta.') };
  }
  redirect('/cuenta');
}

export async function salir(): Promise<void> {
  const s = await leerSesion();
  try {
    if (s.accessToken || s.refreshToken) await hermes.account.logout(s);
  } catch {
    // Si la API falla, igual cerramos la sesión local.
  }
  await borrarSesion();
  redirect('/');
}

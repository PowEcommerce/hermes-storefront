// Go Personal (app `gopersonal` del App Store de Hermes): personalización
// (carruseles, recomendaciones, pop-ups) y push. Se prende desde el admin; la
// tienda lo lee de `storefront/config` → `gopersonal` (tag `settings`: el
// cambio llega con la purga). Ver components/GoPersonal.tsx y
// app/gp-firebase.js/route.ts.
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  GOPERSONAL_IDENTITY_COOKIE,
  GOPERSONAL_IDENTITY_MAX_AGE,
  goPersonalFrom,
  goPersonalIdentityCookie,
  type GoPersonalSettings,
} from '@hermesecommerce/storefront/gopersonal';
import { hermes } from './hermes';

/** Qué prender (deduplicado por render; la config queda en la caché de Next por tags). */
export const getGoPersonal = cache(async (): Promise<GoPersonalSettings> => {
  try {
    return goPersonalFrom(await hermes.config.get());
  } catch {
    // Sin config: la tienda como siempre, sin Go Personal.
    return goPersonalFrom(null);
  }
});

/**
 * Después de un login, registro o logout (Server Actions que terminan en un
 * redirect): deja la cookie corta que lee el navegador para avisarle a Go
 * Personal quién es el comprador. Sin la app, no hace nada. Nunca tira.
 */
export async function avisarIdentidadAGoPersonal(
  quien: { accessToken: string } | 'logout',
): Promise<void> {
  try {
    if (!(await getGoPersonal()).sdkEnabled) return;
    let valor: string;
    if (quien === 'logout') valor = goPersonalIdentityCookie('logout');
    else {
      const me = await hermes.account.me(quien.accessToken);
      if (!me.logged || !me.user) return;
      valor = goPersonalIdentityCookie({ customerId: me.user.id, email: me.user.email });
    }
    (await cookies()).set(GOPERSONAL_IDENTITY_COOKIE, valor, {
      // La lee el navegador (no lleva tokens: el id y el email del comprador).
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: GOPERSONAL_IDENTITY_MAX_AGE,
    });
  } catch {
    // Go Personal nunca frena un login.
  }
}

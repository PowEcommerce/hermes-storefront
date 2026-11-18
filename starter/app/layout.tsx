import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getBrand } from '@/lib/brand';
import { getGoPersonal } from '@/lib/gopersonal';
import { GoPersonal } from '@/components/GoPersonal';
import { Header } from '@/components/Header';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: `Tienda online de ${brand.name}`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  const gp = await getGoPersonal();
  const style = {
    ...brand.cssVars,
    ...(brand.fontFamily ? { '--brand-font': brand.fontFamily } : {}),
  } as CSSProperties;

  return (
    <html lang="es-AR" style={style}>
      <head>
        {/* La fuente de la marca (storefront/config → checkout.config.fuente) */}
        {brand.fontCss && <link rel="stylesheet" href={brand.fontCss} />}
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Header brand={brand} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-border py-8 text-center text-xs text-muted-fg">
          {brand.name} · Hecho con Hermes
        </footer>
        {/* Go Personal (app del App Store): sólo con la app prendida y el client id cargado. */}
        {gp.sdkEnabled && gp.clientId && <GoPersonal clientId={gp.clientId} />}
      </body>
    </html>
  );
}

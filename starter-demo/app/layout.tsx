import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Schibsted_Grotesk } from 'next/font/google';
import { getBrand } from '@/lib/brand';
import { Header } from '@/components/header/Header';
import { Footer } from '@/components/Footer';
import { ScrollTop } from '@/components/ScrollTop';
import './globals.css';

// Tipografía de la demo: Schibsted Grotesk (Google Fonts, licencia OFL). Next
// la baja en el build y la sirve desde la tienda (sin pedidos a Google). Si
// la marca tiene su propia fuente en storefront/config, esa gana (--brand-font).
const display = Schibsted_Grotesk({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: brand.name, template: `%s | ${brand.name}` },
    description: `Tienda online de ${brand.name}`,
    openGraph: { siteName: brand.name, locale: 'es_AR', type: 'website' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  const style = {
    ...brand.cssVars,
    ...(brand.fontFamily ? { '--brand-font': brand.fontFamily } : {}),
  } as CSSProperties;

  return (
    <html lang="es-AR" style={style} className={display.variable}>
      <head>
        {/* La fuente de la marca (storefront/config → checkout.config.fuente) */}
        {brand.fontCss && <link rel="stylesheet" href={brand.fontCss} />}
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2000] focus:bg-bg focus:p-3">
          Saltar al contenido
        </a>
        <Header brand={brand} />
        <main id="contenido" className="w-full flex-1">
          {children}
        </main>
        <Footer brand={brand} />
        <ScrollTop />
      </body>
    </html>
  );
}

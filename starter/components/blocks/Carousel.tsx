'use client';
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const INTERVALO_MS = 6000;

/**
 * Carrusel mínimo sobre scroll-snap del navegador (sin Swiper): flechas,
 * puntos y autoplay que se pausa con el mouse encima, con el foco adentro,
 * con la pestaña oculta y con "reducir movimiento".
 */
export function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const slides = Children.toArray(children);
  const pista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const total = slides.length;

  const ir = useCallback(
    (i: number) => {
      const el = pista.current;
      if (!el) return;
      const n = (i + total) % total;
      el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    },
    [total],
  );

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const alMover = () => setActual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', alMover, { passive: true });
    return () => el.removeEventListener('scroll', alMover);
  }, []);

  useEffect(() => {
    if (total < 2 || pausa) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      if (!document.hidden) ir(actual + 1);
    }, INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [actual, pausa, total, ir]);

  return (
    <div
      className="group relative overflow-hidden rounded-brand"
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)}
      onBlur={() => setPausa(false)}
    >
      <div
        ref={pista}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <div
            key={i}
            className="w-full shrink-0 snap-start snap-always"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${total}`}
            inert={i !== actual}
          >
            {s}
          </div>
        ))}
      </div>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(actual - 1)}
            aria-label="Anterior"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg text-black opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => ir(actual + 1)}
            aria-label="Siguiente"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg text-black opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Ir al ${i + 1}`}
                aria-current={i === actual}
                className={`h-2 rounded-full bg-white shadow transition-all ${i === actual ? 'w-6 opacity-100' : 'w-2 opacity-60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

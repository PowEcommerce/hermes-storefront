'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * mp4 muteado en loop (como un gif): los <source> se ponen recién cuando el
 * video se acerca a la pantalla, así no se baja nada que no se vea. El de
 * mobile va con `media` (hasta 767px). Con "reducir movimiento" no arranca
 * solo: queda con controles.
 */
export function LazyVideo({
  src,
  mobileSrc,
  poster,
  eager,
}: {
  src: string;
  mobileSrc?: string | null;
  poster?: string | null;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));

  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    el.load();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) el.controls = true;
    else el.play().catch(() => {});
  }, [visible]);

  return (
    <video ref={ref} muted loop playsInline preload="none" poster={poster || undefined} className="block h-auto w-full">
      {visible && mobileSrc && mobileSrc !== src && <source src={mobileSrc} type="video/mp4" media="(max-width: 767px)" />}
      {visible && <source src={src} type="video/mp4" />}
    </video>
  );
}

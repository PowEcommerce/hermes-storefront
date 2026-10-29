import { LazyVideo } from './LazyVideo';
import { BlockLink, texto, type BlockProps } from './shared';

const ID = /^[\w-]{6,20}$/;

/** El embed de YouTube/Vimeo, armado desde el id (sin autoplay: el usuario le da play). */
export function embedUrl(fuente: string | null | undefined, id: string | null | undefined, armada?: string | null): string | null {
  const f = (fuente ?? '').toLowerCase();
  const i = texto(id);
  if (i && ID.test(i)) {
    if (f === 'youtube') return `https://www.youtube-nocookie.com/embed/${i}?rel=0&playsinline=1`;
    if (f === 'vimeo') return `https://player.vimeo.com/video/${i}`;
  }
  const url = texto(armada)?.replace(/&amp;/gi, '&') ?? null;
  if (!url || !/^https:\/\/(www\.youtube(-nocookie)?\.com|player\.vimeo\.com)\//.test(url)) return null;
  // Sin autoplay con sonido: si el backoffice lo pidió, que arranque muteado.
  return /[?&]autoplay=1/.test(url) && !/[?&]mute=1/.test(url) ? `${url}&mute=1` : url;
}

const esMp4 = (v: unknown) => {
  const s = texto(v);
  return s && /^https?:\/\//.test(s) ? s : null;
};

/**
 * Video del backoffice: si hay mp4 subido (`video_block*`) gana (muteado, en
 * loop, se carga recién al acercarse a la pantalla); si no, el embed de
 * YouTube/Vimeo con `loading="lazy"`.
 */
export function VideoBlock({ block: b, priority }: BlockProps<'PageBlock::Video'>) {
  const mp4 = esMp4(b.video_block) ?? (b.vidsource === 'mp4' ? esMp4(b.href_desktop) : null);
  const mp4Mobile = esMp4(b.video_block_mobile) ?? (b.vidsourcemobile === 'mp4' ? esMp4(b.href_mobile) : null);
  const video = mp4 ?? mp4Mobile;
  if (video)
    return (
      <BlockLink href={b.href} className="block overflow-hidden rounded-brand" label={texto(b.title) ?? undefined}>
        <LazyVideo src={video} mobileSrc={mp4Mobile} poster={texto(b.image)} eager={priority} />
      </BlockLink>
    );

  const desktop = embedUrl(b.vidsource, b.href_desktop, b.video_url_desktop);
  const mobile = embedUrl(b.vidsourcemobile ?? b.vidsource, b.href_mobile, b.video_url_mobile);
  if (!desktop && !mobile) return null;
  const titulo = texto(b.title) ?? 'Video';
  const boton = texto(b.button_title);
  return (
    <div className="space-y-3">
      {desktop && (
        <iframe
          src={desktop}
          title={titulo}
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className={`aspect-video w-full rounded-brand ${mobile && mobile !== desktop ? 'hidden md:block' : ''}`}
        />
      )}
      {mobile && mobile !== desktop && (
        <iframe
          src={mobile}
          title={titulo}
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className={`aspect-video w-full rounded-brand ${desktop ? 'md:hidden' : ''}`}
        />
      )}
      {boton && b.href && (
        <div className="text-center">
          <BlockLink href={b.href} className="btn-outline">
            {boton}
          </BlockLink>
        </div>
      )}
    </div>
  );
}

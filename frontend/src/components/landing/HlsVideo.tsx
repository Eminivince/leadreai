'use client';

import { useEffect, useRef } from 'react';

interface HlsVideoProps {
 src: string;
 className?: string;
 style?: React.CSSProperties;
 poster?: string;
 desaturate?: boolean;
}

export function HlsVideo({ src, className, style, poster, desaturate = false }: HlsVideoProps) {
 const ref = useRef<HTMLVideoElement>(null);

 useEffect(() => {
  const video = ref.current;
  if (!video) return;

  let cleanup: (() => void) | undefined;

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
   video.src = src;
   video.play().catch(() => {});
  } else {
   import('hls.js').then(({ default: Hls }) => {
    if (!Hls.isSupported()) {
     video.src = src;
     video.play().catch(() => {});
     return;
    }
    const hls = new Hls({ enableWorker: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
     video.play().catch(() => {});
    });
    cleanup = () => hls.destroy();
   });
  }

  return () => cleanup?.();
 }, [src]);

 return (
  <video
   ref={ref}
   autoPlay
   loop
   muted
   playsInline
   poster={poster}
   className={className}
   style={{ ...(desaturate ? { filter: 'saturate(0)' } : {}), ...style }}
  />
 );
}

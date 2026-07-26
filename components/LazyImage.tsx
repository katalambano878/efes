'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  onLoad?: () => void;
  sizes?: string;
}

function isStorageSrc(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/storage/')) return true;
  return url.includes('/storage/v1/object/');
}

export default function LazyImage({
  src,
  alt,
  className = '',
  width,
  height,
  priority = false,
  onLoad,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
}: LazyImageProps) {
  const storageSrc = isStorageSrc(src);
  const [isLoaded, setIsLoaded] = useState(storageSrc);
  const [hasError, setHasError] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);
  const retriedRef = useRef(false);

  useEffect(() => {
    setDisplaySrc(src);
    setHasError(false);
    retriedRef.current = false;
    setIsLoaded(isStorageSrc(src));
  }, [src]);

  useEffect(() => {
    if (isLoaded || hasError) return;
    const t = window.setTimeout(() => setIsLoaded(true), 2000);
    return () => window.clearTimeout(t);
  }, [displaySrc, isLoaded, hasError]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    if (isStorageSrc(displaySrc) && !retriedRef.current) {
      retriedRef.current = true;
      setDisplaySrc((prev) => {
        const sep = prev.includes('?') ? '&' : '?';
        return `${prev}${sep}_retry=${Date.now()}`;
      });
      return;
    }
    setHasError(true);
    setIsLoaded(true);
    onLoad?.();
  };

  const resolvedSrc = displaySrc?.includes('via.placeholder.com') ? '' : displaySrc;
  const useNativeImg = isStorageSrc(resolvedSrc);
  const fillParent =
    className.includes('h-full') ||
    className.includes('w-full') ||
    useNativeImg;

  if (!resolvedSrc || hasError) {
    return (
      <div className={`relative overflow-hidden bg-gray-200 flex items-center justify-center ${className}`} style={{ width, height }}>
        <span className="text-gray-400 text-xs">No Image</span>
      </div>
    );
  }

  const opacityClass = isLoaded ? 'opacity-100' : 'opacity-0';

  return (
    <div className={`relative overflow-hidden ${fillParent ? 'w-full h-full' : ''} ${className}`} style={fillParent ? undefined : { width, height }}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse z-10 pointer-events-none"></div>
      )}
      {useNativeImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${opacityClass}`}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <Image
          src={resolvedSrc}
          alt={alt}
          fill={fillParent}
          width={fillParent ? undefined : width}
          height={fillParent ? undefined : height}
          sizes={sizes}
          className={`object-cover transition-opacity duration-300 ${opacityClass}`}
          onLoad={handleLoad}
          onError={handleError}
          priority={priority}
          quality={75}
          unoptimized={/^https?:\/\//.test(resolvedSrc)}
        />
      )}
    </div>
  );
}

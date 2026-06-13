'use client';

import { useEffect, useState } from 'react';
import { resolveCategoryImageUrl } from '@/lib/category-image-url';

type Props = {
  imageUrl?: string | null;
  name: string;
  className?: string;
};

/** Direct img load with fallback — avoids Next/Image optimizer failures on Supabase URLs. */
export default function CategoryTileImage({ imageUrl, name, className = '' }: Props) {
  const resolved = resolveCategoryImageUrl(imageUrl, name);
  const placeholder = resolveCategoryImageUrl(null, name);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setSrc(placeholder)}
    />
  );
}

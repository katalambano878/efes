'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';

// Map common color names to hex values for swatches
const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  // Try partial match (e.g. "Light Blue" -> "blue")
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductCardProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  /** Shown as an amber “Preorder” pill alongside other badges */
  isPreorder?: boolean;
  inStock?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  rating = 5,
  reviewCount = 0,
  badge,
  isPreorder = false,
  inStock = true,
  maxStock = 50,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = []
}: ProductCardProps) {
  const { addToCart } = useCart();
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const displayPrice = hasVariants && minVariantPrice ? minVariantPrice : price;
  const discount = originalPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;
  const MAX_SWATCHES = 5;

  const formatPrice = (val: number) => `GH\u20B5${val.toFixed(2)}`;

  return (
    <div className="group h-full flex flex-col bg-white rounded-[1.5rem] border border-gray-100 p-3 lg:p-4 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-500">
      <div className="relative block aspect-[4/5] rounded-2xl overflow-hidden bg-[#f8f8f8] mb-5">
        <Link href={`/product/${slug}`} className="absolute inset-0 z-10 block">
          <LazyImage
            src={image}
            alt={name}
            className="w-full h-full object-cover object-top transition-transform duration-[1.5s] ease-out group-hover:scale-[1.03]"
          />
        </Link>

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 z-20 pointer-events-none">
          {isPreorder && (
            <span className="bg-amber-500/95 backdrop-blur-md text-white border border-amber-400/50 rounded-full text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5">
              Preorder
            </span>
          )}
          {badge && (
            <span className="bg-white/80 backdrop-blur-md text-gray-900 border border-gray-200/50 rounded-full text-[10px] uppercase tracking-widest font-medium px-3 py-1.5">
              {badge}
            </span>
          )}
          {discount > 0 && (
            <span className="bg-red-500/90 backdrop-blur-md text-white rounded-full text-[10px] uppercase tracking-widest font-medium px-3 py-1.5">
              -{discount}%
            </span>
          )}
        </div>

        {/* Sold Out Overlay */}
        {!inStock && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center z-20 pointer-events-none">
            <span className="bg-gray-900 text-white rounded-full px-6 py-2 text-[11px] tracking-widest uppercase font-medium">Sold Out</span>
          </div>
        )}

        {/* Center Desktop Button (The God-Level Detail) */}
        {inStock && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none lg:pointer-events-auto">
            {hasVariants ? (
              <Link
                href={`/product/${slug}`}
                className="bg-[#0f172a] text-white rounded-full px-8 py-3.5 text-[11px] tracking-[0.1em] uppercase font-bold opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out shadow-xl hover:bg-black"
              >
                Select Options
              </Link>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq });
                }}
                className="bg-[#0f172a] text-white rounded-full px-8 py-3.5 text-[11px] tracking-[0.1em] uppercase font-bold opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out shadow-xl hover:bg-black"
              >
                Quick Add
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col flex-grow text-center items-center px-2">
        <Link href={`/product/${slug}`} className="mb-2">
          <h3 className="font-serif text-[16px] text-[#475569] hover:text-[#0f172a] transition-colors line-clamp-2">
            {name}
          </h3>
        </Link>

        {colorVariants.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`w-3 h-3 rounded-full border transition-all duration-300 flex-shrink-0 ${
                  activeColor === color.name
                    ? 'ring-1 ring-offset-2 ring-[#0f172a] scale-110'
                    : 'hover:scale-110'
                } ${color.hex === '#FFFFFF' ? 'border-gray-200' : 'border-transparent'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className="text-[10px] text-gray-400 ml-1">+{colorVariants.length - MAX_SWATCHES}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-center space-x-2 mt-auto pb-1">
          {hasVariants && minVariantPrice ? (
            <span className="text-[#0f172a] text-[15px] font-semibold tracking-tight">From {formatPrice(minVariantPrice)}</span>
          ) : (
            <span className="text-[#0f172a] text-[15px] font-semibold tracking-tight">{formatPrice(price)}</span>
          )}
          {originalPrice && (
            <span className="text-sm text-gray-400 line-through tracking-tight">{formatPrice(originalPrice)}</span>
          )}
        </div>

        {/* Mobile Action Button */}
        <div className="mt-4 w-full lg:hidden">
          {hasVariants ? (
            <Link
              href={`/product/${slug}`}
              className="w-full border border-gray-200 text-[#0f172a] rounded-full py-3 text-[11px] tracking-[0.1em] uppercase font-bold hover:bg-[#0f172a] hover:text-white transition-colors flex items-center justify-center"
            >
              Select Options
            </Link>
          ) : (
            <button
               onClick={(e) => {
                 e.preventDefault();
                 addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq });
               }}
               disabled={!inStock}
               className="w-full border border-gray-200 text-[#0f172a] rounded-full py-3 text-[11px] tracking-[0.1em] uppercase font-bold hover:bg-[#0f172a] hover:text-white transition-colors flex items-center justify-center disabled:opacity-50"
             >
               Add To Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

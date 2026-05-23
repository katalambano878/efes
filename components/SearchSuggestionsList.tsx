'use client';

import Link from 'next/link';

export type SearchSuggestionItem = {
  slug: string;
  name: string;
  price: number;
  image: string | null;
};

const PLACEHOLDER =
  'https://via.placeholder.com/72x72/f3f4f6/9ca3af?text=%E2%80%A2';

type Props = {
  query: string;
  items: SearchSuggestionItem[];
  loading: boolean;
  currencySymbol: string;
  onPick?: () => void;
  className?: string;
};

export default function SearchSuggestionsList({
  query,
  items,
  loading,
  currencySymbol,
  onPick,
  className = '',
}: Props) {
  if (!query) return null;

  const fmt = (n: number) =>
    `${currencySymbol}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div
      className={`w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden ${className}`}
      role="listbox"
      aria-label="Product suggestions"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="max-h-[min(70vh,22rem)] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <i className="ri-loader-4-line animate-spin text-lg" />
            Searching…
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500 px-4">No products match &ldquo;{query}&rdquo;</p>
        )}

        {!loading &&
          items.map((p) => (
            <Link
              key={p.slug}
              href={`/product/${p.slug}`}
              role="option"
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
              onClick={onPick}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.image || PLACEHOLDER}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover bg-gray-100"
                width={56}
                height={56}
              />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmt(p.price)}</p>
              </div>
              <i className="ri-arrow-right-s-line text-gray-300 shrink-0" aria-hidden />
            </Link>
          ))}
      </div>

      {!loading && query.length >= 1 && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-3 py-2">
          <Link
            href={`/shop?search=${encodeURIComponent(query)}`}
            className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-800 hover:text-black py-1.5"
            onClick={onPick}
          >
            View all results
            <i className="ri-arrow-right-line" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}

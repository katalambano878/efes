/** Resolve a safe public URL for category tiles (avoids broken icons on bad/empty values). */
export function resolveCategoryImageUrl(
  imageUrl: string | null | undefined,
  categoryName: string
): string {
  const raw = String(imageUrl || '').trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return `https://via.placeholder.com/600x800?text=${encodeURIComponent(categoryName || 'Category')}`;
}

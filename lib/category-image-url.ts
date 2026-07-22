/** Resolve a safe public URL for category tiles (avoids broken icons on bad/empty values). */
export function resolveCategoryImageUrl(
  imageUrl: string | null | undefined,
  categoryName: string
): string {
  const raw = String(imageUrl || '').trim();
  // Absolute remote URLs OR same-origin paths (/storage/..., /images/...)
  if (raw && (/^https?:\/\//i.test(raw) || raw.startsWith('/'))) {
    return raw;
  }
  // Local SVG — never via.placeholder.com (often blocked; SW painted "Image unavailable")
  const label = (categoryName || 'Category')
    .slice(0, 24)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect fill="#e5e7eb" width="600" height="800"/><text fill="#9ca3af" font-family="sans-serif" font-size="28" text-anchor="middle" x="300" y="400">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

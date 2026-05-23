import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Preorder',
  description: `Shop preorder items at ${siteName}. Reserve upcoming pieces before they arrive in store.`,
  openGraph: {
    title: `Preorder | ${siteName}`,
    description: `Reserve upcoming drops and preorder-only products at ${siteName}.`,
    url: `${siteUrl}/preorder`,
  },
  alternates: { canonical: `${siteUrl}/preorder` },
};

export default function PreorderLayout({ children }: { children: React.ReactNode }) {
  return children;
}

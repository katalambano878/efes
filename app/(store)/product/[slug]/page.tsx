import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ProductDetailClient from './ProductDetailClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://efescloset.com').replace(/\/+$/, '');
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: product } = await supabase
      .from('products')
      .select('name, description, seo_title, seo_description, tags, metadata, product_images(url, position)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (!product) return { title: 'Product Not Found' };

    const images = Array.isArray(product.product_images)
      ? [...product.product_images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      : [];

    // Admin-set SEO overrides (saved via Product form → SEO tab)
    const seoMeta = (product.metadata && typeof product.metadata === 'object' && product.metadata.seo) || {};
    const cleanDesc = product.description
      ? product.description.replace(/<[^>]*>/g, '').slice(0, 160)
      : '';

    const title: string = product.seo_title || product.name;
    const description: string =
      product.seo_description ||
      cleanDesc ||
      `Shop ${product.name} at ${siteName}. Quality fashion with nationwide delivery in Ghana.`;

    const ogTitle: string = seoMeta.og_title || product.seo_title || product.name;
    const ogDescription: string = seoMeta.og_description || description;
    const imageUrl: string = seoMeta.og_image || images[0]?.url || `${siteUrl}/opengraph-image`;
    const keywords: string[] = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];
    const allowIndex: boolean = seoMeta.robots_index !== false; // default true

    return {
      title,
      description,
      keywords: keywords.length ? keywords : undefined,
      robots: {
        index: allowIndex,
        follow: allowIndex,
        googleBot: { index: allowIndex, follow: allowIndex },
      },
      openGraph: {
        title: `${ogTitle} | ${siteName}`,
        description: ogDescription,
        url: `${siteUrl}/product/${slug}`,
        type: 'website',
        siteName,
        images: [{ url: imageUrl, width: 1200, height: 630, alt: ogTitle }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${ogTitle} | ${siteName}`,
        description: ogDescription,
        images: [imageUrl],
      },
      alternates: { canonical: `${siteUrl}/product/${slug}` },
    };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}

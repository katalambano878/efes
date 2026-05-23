import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ProductDetailClient from './ProductDetailClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: product } = await supabase
      .from('products')
      .select('name, description, price, compare_at_price, product_images(url, position)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (!product) return { title: 'Product Not Found' };

    const images = Array.isArray(product.product_images)
      ? [...product.product_images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      : [];
    const imageUrl = images[0]?.url || `${siteUrl}/opengraph-image`;
    const title = product.name;
    const description = product.description
      ? product.description.replace(/<[^>]*>/g, '').slice(0, 160)
      : `Shop ${product.name} at ${siteName}. Quality fashion with nationwide delivery in Ghana.`;

    return {
      title,
      description,
      openGraph: {
        title: `${title} | ${siteName}`,
        description,
        url: `${siteUrl}/product/${slug}`,
        type: 'website',
        siteName,
        images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} | ${siteName}`,
        description,
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

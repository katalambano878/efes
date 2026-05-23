import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://efescloset.com').replace(/\/+$/, '');
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/checkout',
          '/cart',
          '/account/',
          '/wishlist',
          '/order-success',
          '/pay/',
          '/pwa-settings',
          '/offline',
          '/maintenance',
          '/auth/',
          '/support/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

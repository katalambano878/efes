'use client';

import { Suspense } from 'react';
import ShopListingContent from '@/components/shop/ShopListingContent';

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopListingContent
        pageTitle="Shop All Products"
        heroTitle="Shop All Products"
        heroSubtitle="Discover our curated collection of premium goods"
        heroImage="/Whisk_hvmy5ado3udzhvwytmdz0ewl5etn00iz5qwotyw.jpeg"
      />
    </Suspense>
  );
}

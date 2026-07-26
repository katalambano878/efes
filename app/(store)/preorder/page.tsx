'use client';

import { Suspense } from 'react';
import ShopListingContent from '@/components/shop/ShopListingContent';

export default function PreorderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopListingContent
        pageTitle="Preorder"
        heroTitle="Preorder"
        heroSubtitle="Reserve pieces before they land in store. Estimated shipping dates are shown on each product."
        heroImage="/Whisk_hvmy5ado3udzhvwytmdz0ewl5etn00iz5qwotyw.webp"
        availability="preorder"
      />
    </Suspense>
  );
}

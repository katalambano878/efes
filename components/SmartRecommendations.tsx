'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviews: number;
}

interface SmartRecommendationsProps {
  productId?: string;
  type: 'similar' | 'also-bought' | 'personalized' | 'complete-look' | 'trending';
  title?: string;
}

export default function SmartRecommendations({ productId, type, title }: SmartRecommendationsProps) {
  const [products, setProducts] = useState<Product[]>([]);

  const allProducts: Product[] = [
    {
      id: '1',
      name: 'Premium Wireless Headphones',
      price: 450,
      originalPrice: 599,
      image: '/placeholder.jpg',
      rating: 4.8,
      reviews: 234
    },
    {
      id: '2',
      name: 'Smart Fitness Watch',
      price: 320,
      image: '/placeholder.jpg',
      rating: 4.6,
      reviews: 189
    },
    {
      id: '3',
      name: 'Leather Crossbody Bag',
      price: 289,
      originalPrice: 399,
      image: '/placeholder.jpg',
      rating: 4.9,
      reviews: 312
    },
    {
      id: '4',
      name: 'Minimalist Ceramic Vase Set',
      price: 159,
      image: '/placeholder.jpg',
      rating: 4.7,
      reviews: 156
    }
  ];

  useEffect(() => {
    const shuffled = [...allProducts].sort(() => 0.5 - Math.random());
    setProducts(shuffled.slice(0, 4));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- allProducts is static; run when productId or type changes
  }, [productId, type]);

  const getTitleByType = () => {
    if (title) return title;
    switch (type) {
      case 'similar':
        return 'Similar Products';
      case 'also-bought':
        return 'Customers Also Bought';
      case 'personalized':
        return 'Recommended For You';
      case 'complete-look':
        return 'Complete The Look';
      case 'trending':
        return 'Trending Now';
      default:
        return 'You May Also Like';
    }
  };

  if (products.length === 0) return null;

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{getTitleByType()}</h2>
          <Link
            href="/shop"
            className="text-gray-900 hover:text-gray-800 font-medium flex items-center space-x-1 whitespace-nowrap"
          >
            <span>View All</span>
            <i className="ri-arrow-right-line"></i>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/product/${product.id}`}
              className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow group"
            >
              <div className="relative aspect-square overflow-hidden bg-gray-100">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                />
                {product.originalPrice && (
                  <div className="absolute top-3 left-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                    -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-gray-900 transition-colors">
                  {product.name}
                </h3>
                <div className="flex items-center space-x-2 mb-3">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <i
                        key={i}
                        className={`ri-star-${i < Math.floor(product.rating) ? 'fill' : 'line'} text-sm ${
                          i < Math.floor(product.rating) ? 'text-yellow-400' : 'text-gray-300'
                        }`}
                      ></i>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">({product.reviews})</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-lg font-bold text-gray-900">GH₵{product.price}</span>
                  {product.originalPrice && (
                    <span className="text-sm text-gray-400 line-through">GH₵{product.originalPrice}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

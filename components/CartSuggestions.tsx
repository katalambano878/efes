'use client';

import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
}

export default function CartSuggestions() {
  const suggestedProducts: Product[] = [
    {
      id: '21',
      name: 'Premium Wireless Headphones',
      price: 129.99,
      originalPrice: 179.99,
      image: '/placeholder.jpg',
      rating: 4.8
    },
    {
      id: '22',
      name: 'Leather Card Holder Wallet',
      price: 34.99,
      originalPrice: 49.99,
      image: '/placeholder.jpg',
      rating: 4.7
    },
    {
      id: '23',
      name: 'Smart Watch Band',
      price: 24.99,
      image: '/placeholder.jpg',
      rating: 4.6
    },
    {
      id: '24',
      name: 'Phone Stand Holder',
      price: 19.99,
      originalPrice: 29.99,
      image: '/placeholder.jpg',
      rating: 4.5
    }
  ];

  return (
    <div className="bg-gray-100 border-2 border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">You Might Also Like</h3>
        <span className="text-sm text-gray-900 font-medium whitespace-nowrap">Boost Your Order</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {suggestedProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <Link href={`/product/${product.id}`}>
              <div className="aspect-square bg-gray-100 overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-3">
                <h4 className="font-semibold text-gray-900 text-sm mb-2 line-clamp-2">{product.name}</h4>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg font-bold text-gray-900">GH₵{product.price.toFixed(2)}</span>
                  {product.originalPrice && (
                    <span className="text-xs text-gray-400 line-through">GH₵{product.originalPrice.toFixed(2)}</span>
                  )}
                </div>
                <button className="w-full py-2 bg-gray-900 text-white text-sm rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap">
                  <i className="ri-add-line mr-1"></i>
                  Quick Add
                </button>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

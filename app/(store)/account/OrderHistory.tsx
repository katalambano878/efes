'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import { money, asNumber } from '@/lib/format-money';

interface OrderItem {
  id: string;
  productId: string | null;
  name: string;
  image: string;
  quantity: number;
  price: number;
  variant?: string | null;
  slug?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  email: string;
  date: string;
  status: string;
  total: number;
  items: OrderItem[];
}

export default function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const { addToCart, setIsCartOpen } = useCart();
  const router = useRouter();

  useEffect(() => {
    async function fetchOrders() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        if (session.user.email) setUserEmail(session.user.email);

        const { data, error } = await supabase
          .from('orders')
          .select(`
                    *,
                    order_items (*)
                `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const formattedOrders = data.map((order: any) => ({
            id: order.id,
            orderNumber: order.order_number,
            email: order.email || session.user.email || '',
            date: order.created_at,
            status: order.status,
            total: asNumber(order.total),
            items: order.order_items.map((item: any) => ({
              id: item.id,
              productId: item.product_id || null,
              name: item.product_name,
              image: item.metadata?.image || '/logo-efes.png',
              quantity: item.quantity,
              price: asNumber(item.unit_price),
              variant: item.variant_name || null,
              slug: item.metadata?.slug || '',
            })),
          }));
          setOrders(formattedOrders);
        }
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-gray-100 text-gray-700';
      case 'dispatched_to_rider':
        return 'bg-indigo-100 text-indigo-700';
      case 'shipped':
        return 'bg-blue-100 text-blue-700';
      case 'processing':
        return 'bg-yellow-100 text-yellow-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    try {
      let added = 0;
      for (const item of order.items) {
        if (!item.productId && !item.slug) continue;
        try {
          const key = item.slug || item.productId;
          if (!key) continue;
          const res = await fetch(`/api/storefront/products/${encodeURIComponent(key)}`);
          if (!res.ok) continue;
          const product = await res.json();
          if (!product?.id || product.status === 'archived' || product.status === 'draft') continue;
          const qty = asNumber(product.quantity ?? product.stock ?? 0);
          if (qty <= 0 && product.inStock === false) continue;

          const image =
            product.product_images?.[0]?.url ||
            product.images?.[0]?.url ||
            item.image ||
            '/logo-efes.png';
          const price = asNumber(product.sale_price ?? product.price ?? item.price);

          addToCart({
            id: product.id || item.productId!,
            name: product.name || item.name,
            price,
            image,
            quantity: Math.max(1, item.quantity),
            variant: item.variant || undefined,
            slug: product.slug || item.slug || product.id || item.productId!,
            maxStock: Math.max(1, qty || item.quantity || 1),
            moq: asNumber(product.moq ?? product.min_order_quantity ?? 1) || 1,
          });
          added += 1;
        } catch {
          /* skip unavailable lines */
        }
      }

      if (added === 0) {
        const firstWithSlug = order.items.find((i) => i.slug);
        if (firstWithSlug?.slug) {
          router.push(`/product/${firstWithSlug.slug}`);
        } else {
          window.alert('None of the items from this order are available to reorder right now.');
        }
        return;
      }
      setIsCartOpen(true);
      router.push('/cart');
    } finally {
      setReorderingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
        <p className="mt-2 text-gray-500">Loading orders...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ri-shopping-bag-line text-3xl text-gray-400"></i>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No orders yet</h3>
        <p className="text-gray-500 mb-6">Start shopping to see your orders here.</p>
        <Link href="/shop" className="inline-block bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors">
          Go to Shop
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Order History</h2>
        <div className="text-sm text-gray-600">
          Total Orders: <span className="font-bold text-gray-900">{orders.length}</span>
        </div>
      </div>

      <div className="space-y-6">
        {orders.map((order) => {
          const trackEmail = order.email || userEmail;
          const trackHref = trackEmail
            ? `/order-tracking?order=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(trackEmail)}`
            : `/order-tracking?order=${encodeURIComponent(order.orderNumber)}`;
          const helpHref = `/contact?order=${encodeURIComponent(order.orderNumber)}&subject=${encodeURIComponent(`Help with order ${order.orderNumber}`)}`;

          return (
            <div key={order.id} className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 sm:gap-6 w-full sm:w-auto">
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Order Number</p>
                      <p className="font-bold text-gray-900">{order.orderNumber}</p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Date</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(order.date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Total</p>
                      <p className="font-bold text-gray-900">GH₵{money(order.total)}</p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto">
                    <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${getStatusColor(order.status)}`}>
                      {order.status === 'shipped' ? 'Packaged' : order.status === 'dispatched_to_rider' ? 'Dispatched To Rider' : order.status.replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase())}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4 mb-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex space-x-4">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover object-center"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-1">{item.name}</h4>
                        <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">GH₵{money(item.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-4 border-t border-gray-200">
                  <Link
                    href={trackHref}
                    className="flex-1 sm:flex-none text-center px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-map-pin-line mr-2"></i>
                    Track Order
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleReorder(order)}
                    disabled={reorderingId === order.id}
                    className="flex-1 sm:flex-none px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <i className="ri-refresh-line mr-2"></i>
                    {reorderingId === order.id ? 'Adding…' : 'Reorder'}
                  </button>
                  <Link
                    href={`/account/invoice/${order.id}?print=true`}
                    className="flex-1 sm:flex-none text-center px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Invoice
                  </Link>
                  <Link
                    href={helpHref}
                    className="flex-1 sm:flex-none text-center px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-customer-service-line mr-2"></i>
                    Get Help
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

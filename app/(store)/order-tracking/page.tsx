'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function OrderTrackingContent() {
  const searchParams = useSearchParams();
  const urlOrderNumber = searchParams.get('order') || '';

  const [orderNumber, setOrderNumber] = useState(urlOrderNumber);
  const [email, setEmail] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-track if order number AND email are in the URL
  const urlEmail = searchParams.get('email') || '';

  const fetchOrder = useCallback(async (orderNum: string, verifyEmail?: string) => {
    const emailToVerify = verifyEmail || email;

    // SECURITY: Email is required for order tracking to prevent unauthorized access
    if (!emailToVerify) {
      setError('Please enter your email address to verify your identity.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Use secure RPC: returns order only if email matches (RLS blocks direct anon read on orders)
      const { data, error: fetchError } = await supabase.rpc('get_order_for_tracking', {
        p_order_number: orderNum.trim(),
        p_email: emailToVerify.trim(),
      });

      if (fetchError) {
        console.error('Order tracking error:', fetchError);
        setError('Order not found. Please check your order number and try again.');
        setIsTracking(false);
        return;
      }

      if (!data || typeof data !== 'object') {
        setError('Order not found. Please check your order number and email and try again.');
        setIsTracking(false);
        return;
      }

      setOrder(data);
      setIsTracking(true);
    } catch (err) {
      console.error('Error fetching order:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (urlOrderNumber && urlEmail) {
      setEmail(urlEmail);
      fetchOrder(urlOrderNumber, urlEmail);
    }
  }, [urlOrderNumber, urlEmail, fetchOrder]);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!orderNumber) {
      setError('Please enter your order number');
      return;
    }

    if (!email) {
      setError('Please enter your email address for verification');
      return;
    }

    fetchOrder(orderNumber, email);
  };

  // Build tracking timeline from real order data
  const getTrackingSteps = () => {
    if (!order) return [];

    const status = order.status || 'pending';
    const paymentStatus = order.payment_status || 'pending';

    const statusOrder = ['pending', 'processing', 'shipped', 'dispatched_to_rider', 'delivered'];
    const currentIndex = statusOrder.indexOf(status);

    const steps = [
      {
        key: 'placed',
        title: 'Order Placed',
        description: 'Your order has been confirmed',
        date: new Date(order.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        icon: 'ri-checkbox-circle-line',
        status: 'completed' as const
      },
      {
        key: 'payment',
        title: 'Payment',
        description: paymentStatus === 'paid' ? 'Payment confirmed' : 'Awaiting payment',
        date: paymentStatus === 'paid' 
          ? (order.metadata?.payment_verified_at 
            ? new Date(order.metadata.payment_verified_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Confirmed')
          : 'Pending',
        icon: 'ri-bank-card-line',
        status: paymentStatus === 'paid' ? 'completed' as const : 'pending' as const
      },
      {
        key: 'processing',
        title: 'Processing',
        description: 'Your order is being prepared',
        date: currentIndex >= 1 ? 'In progress' : 'Pending',
        icon: 'ri-box-3-line',
        status: currentIndex >= 1 ? 'completed' as const : currentIndex === 0 && paymentStatus === 'paid' ? 'active' as const : 'pending' as const
      },
      {
        key: 'shipped',
        title: 'Packaged',
        description: 'Your order has been packaged',
        date: currentIndex >= 2 ? 'Packaged' : 'Pending',
        icon: 'ri-truck-line',
        status: currentIndex >= 2 ? 'completed' as const : currentIndex === 1 ? 'active' as const : 'pending' as const
      },
      {
        key: 'dispatched_to_rider',
        title: 'Dispatched To Rider',
        description: 'Your package has been sent to the rider for delivery',
        date: currentIndex >= 3 ? 'With rider' : 'Pending',
        icon: 'ri-user-follow-line',
        status: currentIndex >= 3 ? 'completed' as const : currentIndex === 2 ? 'active' as const : 'pending' as const
      },
      {
        key: 'delivered',
        title: 'Delivered',
        description: 'Your order has been delivered',
        date: currentIndex >= 4 ? 'Delivered' : 'Pending',
        icon: 'ri-home-smile-line',
        status: currentIndex >= 4 ? 'completed' as const : currentIndex === 3 ? 'active' as const : 'pending' as const
      }
    ];

    return steps;
  };

  const getStatusBadge = () => {
    if (!order) return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
    
    const statusMap: Record<string, { label: string; color: string }> = {
      'pending': { label: 'Pending', color: 'bg-amber-100 text-amber-800' },
      'processing': { label: 'Processing', color: 'bg-blue-100 text-blue-800' },
      'shipped': { label: 'Packaged', color: 'bg-purple-100 text-purple-800' },
      'dispatched_to_rider': { label: 'Dispatched To Rider', color: 'bg-indigo-100 text-indigo-800' },
      'delivered': { label: 'Delivered', color: 'bg-gray-100 text-gray-800' },
      'cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-800' }
    };

    return statusMap[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800' };
  };

  // Search form
  if (!isTracking || !order) {
    return (
      <main className="min-h-screen bg-white py-20 px-4">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-serif text-black mb-4">Track Your Order</h1>
            <p className="text-gray-500 text-sm tracking-wide">Enter your order number or tracking number to track your shipment.</p>
          </div>

          <div className="bg-white">
            <form onSubmit={handleTrack} className="space-y-10">
              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                  Order Number or Tracking Number
                </label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full px-0 py-3 border-0 border-b border-gray-300 rounded-none focus:ring-0 focus:border-black transition-colors"
                  placeholder="e.g. ORD-1770328211911-915"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">
                  Email Address <span className="text-red-500 font-normal">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-0 py-3 border-0 border-b border-gray-300 rounded-none focus:ring-0 focus:border-black transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50/50 border border-red-100 rounded-none">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black hover:bg-gray-800 text-white py-4 text-xs font-bold uppercase tracking-widest rounded-none transition-colors whitespace-nowrap disabled:opacity-50 mt-4"
              >
                {loading ? (
                  <span className="flex items-center justify-center text-gray-400">
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Searching
                  </span>
                ) : 'Track Order'}
              </button>
            </form>

            <div className="mt-12 pt-8 border-t border-gray-100 text-center">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2">Need Help?</p>
              <p className="text-sm text-gray-500">
                You can find your order number in the SMS or email we sent you after confirmation.
              </p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link href="/" className="text-xs uppercase tracking-widest font-bold text-gray-400 hover:text-black transition-colors whitespace-nowrap border-b border-transparent hover:border-gray-900 pb-1">
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Order tracking results
  const trackingSteps = getTrackingSteps();
  const statusBadge = getStatusBadge();
  const trackingNumber = order.metadata?.tracking_number || '';
  const shippingAddress = order.shipping_address || {};
  const estimatedDelivery = new Date(new Date(order.created_at).getTime() + 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button 
            onClick={() => { setIsTracking(false); setOrder(null); setOrderNumber(''); setEmail(''); }}
            className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap cursor-pointer"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Track Another Order
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
              {trackingNumber && (
                <p className="text-gray-600 mt-1">
                  <span className="font-medium">Tracking:</span>{' '}
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-sm">{trackingNumber}</span>
                </p>
              )}
              <p className="text-gray-500 text-sm mt-1">Estimated delivery: {estimatedDelivery}</p>
            </div>
            <div className={`px-4 py-2 rounded-full font-semibold whitespace-nowrap ${statusBadge.color}`}>
              {statusBadge.label}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full">
                  <i className="ri-map-pin-line text-xl text-gray-900"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Shipping To</p>
                  <p className="font-semibold text-gray-900">
                    {shippingAddress.city || shippingAddress.region || 'Ghana'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full">
                  <i className="ri-money-cny-circle-line text-xl text-gray-900"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="font-semibold text-gray-900">GH₵ {Number(order.total).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full">
                  <i className="ri-box-3-line text-xl text-gray-900"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Items</p>
                  <p className="font-semibold text-gray-900">
                    {order.order_items?.length || 0} Product{(order.order_items?.length || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tracking Timeline */}
          <div className="relative">
            {trackingSteps.map((step, index) => (
              <div key={step.key} className="flex items-start mb-8 last:mb-0">
                <div className="relative flex flex-col items-center mr-6">
                  <div className={`w-12 h-12 flex items-center justify-center rounded-full font-bold transition-colors ${
                    step.status === 'completed'
                      ? 'bg-gray-900 text-white'
                      : step.status === 'active'
                      ? 'bg-gray-100 text-gray-900 ring-4 ring-gray-200'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    <i className={`${step.icon} text-xl`}></i>
                  </div>
                  {index < trackingSteps.length - 1 && (
                    <div className={`w-0.5 h-16 mt-2 ${
                      step.status === 'completed' ? 'bg-gray-900' : 'bg-gray-200'
                    }`}></div>
                  )}
                </div>
                <div className="flex-1 pt-2">
                  <h3 className={`font-bold text-lg ${
                    step.status === 'pending' ? 'text-gray-500' : 'text-gray-900'
                  }`}>
                    {step.title}
                  </h3>
                  <p className={`text-sm mt-1 ${
                    step.status === 'pending' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {step.description}
                  </p>
                  <p className={`text-sm mt-1 font-semibold ${
                    step.status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {step.date}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Order Items</h2>
          <div className="space-y-4">
            {order.order_items?.map((item: any) => (
              <div key={item.id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                  {item.products?.product_images?.[0]?.url || item.metadata?.image ? (
                    <img
                      src={item.products?.product_images?.[0]?.url || item.metadata?.image}
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <i className="ri-image-line text-2xl text-gray-300"></i>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{item.product_name}</h3>
                  <p className="text-sm text-gray-600 mt-1">Quantity: {item.quantity}</p>
                  {item.variant_name && (
                    <p className="text-xs text-gray-500">{item.variant_name}</p>
                  )}
                </div>
                <p className="font-bold text-gray-900">GH₵ {Number(item.unit_price).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">Need help with your order?</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
              <i className="ri-customer-service-line mr-1"></i>
              Contact Support
            </Link>
            <Link href="/returns" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
              <i className="ri-arrow-left-right-line mr-1"></i>
              Returns Policy
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </main>
    }>
      <OrderTrackingContent />
    </Suspense>
  );
}

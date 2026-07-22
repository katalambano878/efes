'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function PaymentPage() {
  usePageTitle('Complete Payment');
  const params = useParams<{ orderId?: string }>() as { orderId?: string } | null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = params?.orderId ?? '';
  const wasCanceled = searchParams?.get('canceled') === '1';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('Efescloset');
  const [paymentMethod, setPaymentMethod] = useState<'hubtel' | 'moolre'>('hubtel');

  useEffect(() => {
    // Fetch store name from settings
    supabase.from('store_settings').select('value').eq('key', 'site_name').single()
      .then(({ data }) => { if (data?.value) setStoreName(typeof data.value === 'string' ? data.value : String(data.value)); });

    async function fetchOrder() {
      try {
        // Fetch order by ID (UUID) or order_number
        let query = supabase
          .from('orders')
          .select('*')
          .or(`id.eq.${orderId},order_number.eq.${orderId}`)
          .single();

        const { data, error: fetchError } = await query;

        if (fetchError || !data) {
          setError('Order not found. Please check your link and try again.');
          setLoading(false);
          return;
        }

        setOrder(data);

        const storedMethod =
          data.payment_method ||
          data.metadata?.payment_method ||
          data.metadata?.payment_gateway;
        if (storedMethod === 'moolre' || storedMethod === 'hubtel') {
          setPaymentMethod(storedMethod);
        }

        // If already paid, redirect to success page
        if (data.payment_status === 'paid') {
          router.push(`/order-success?order=${data.order_number}`);
          return;
        }

      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Failed to load order details.');
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchOrder();
    }
  }, [orderId, router]);

  // Show cancel message if redirected back from payment gateway
  useEffect(() => {
    if (!wasCanceled || !order) return;
    setError('Payment was cancelled. You can retry below when ready.');
  }, [order, wasCanceled]);

  const handlePayNow = async () => {
    if (!order) return;

    setProcessing(true);
    setError(null);

    try {
      const paymentEndpoint =
        paymentMethod === 'hubtel' ? '/api/payment/hubtel' : '/api/payment/moolre';

      const paymentRes = await fetch(paymentEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.order_number,
          customerEmail: order.email
        })
      });

      let paymentResult: { success?: boolean; message?: string; url?: string };
      try {
        paymentResult = await paymentRes.json();
      } catch {
        throw new Error(paymentRes.ok ? 'Invalid response from payment server.' : `Payment error (${paymentRes.status}). Please try again or contact support.`);
      }

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Payment initialization failed');
      }

      if (!paymentResult.url) {
        throw new Error('No payment link received. Please try again or contact support.');
      }

      window.location.href = paymentResult.url;

    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err?.message || 'Failed to initialize payment. Please try again or contact support.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
            <i className="ri-error-warning-line text-4xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors"
          >
            <i className="ri-home-line mr-2"></i>
            Go to Homepage
          </Link>
        </div>
      </main>
    );
  }

  const shippingAddress = order?.shipping_address || {};
  const customerName = order?.metadata?.first_name || shippingAddress.firstName || 'Customer';

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold text-gray-700">{storeName}</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="text-gray-600 mt-2">Hi {customerName}, your order is waiting for payment.</p>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <span className="text-sm text-gray-500">Order Number</span>
            <span className="font-semibold text-gray-900">{order?.order_number}</span>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">GH₵ {order?.subtotal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Shipping</span>
              <span className="text-gray-900">GH₵ {order?.shipping_total?.toFixed(2)}</span>
            </div>
            {order?.discount_total > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-gray-700">-GH₵ {order?.discount_total?.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-gray-900">GH₵ {order?.total?.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Status */}
        {order?.payment_status === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-time-line text-xl text-yellow-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Payment Pending</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Complete your payment to confirm your order.
                </p>
              </div>
            </div>
          </div>
        )}

        {order?.payment_status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-red-800">Payment Failed</p>
                <p className="text-sm text-red-700 mt-1">
                  Your previous payment attempt was unsuccessful. Please try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Payment Method Selection */}
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Payment method</h2>
          <div className="space-y-3">
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                paymentMethod === 'hubtel' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="pay-gateway"
                value="hubtel"
                checked={paymentMethod === 'hubtel'}
                onChange={() => setPaymentMethod('hubtel')}
                className="w-5 h-5 text-gray-900 mt-0.5"
              />
              <div>
                <span className="font-semibold text-gray-900 block">Hubtel</span>
                <span className="text-xs text-gray-600">Mobile Money / Cards</span>
              </div>
            </label>
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                paymentMethod === 'moolre' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="pay-gateway"
                value="moolre"
                checked={paymentMethod === 'moolre'}
                onChange={() => setPaymentMethod('moolre')}
                className="w-5 h-5 text-gray-900 mt-0.5"
              />
              <div>
                <span className="font-semibold text-gray-900 block">Moolre</span>
                <span className="text-xs text-gray-600">Mobile Money / Cards</span>
              </div>
            </label>
          </div>
        </div>

        {/* Pay Button */}
        <button
          onClick={handlePayNow}
          disabled={processing}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-semibold text-lg transition-colors disabled:opacity-70 flex items-center justify-center cursor-pointer"
        >
          {processing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <i className="ri-secure-payment-line mr-2"></i>
              {order?.payment_status === 'failed'
                ? `Retry with ${paymentMethod === 'hubtel' ? 'Hubtel' : 'Moolre'} (GH₵ ${order?.total?.toFixed(2)})`
                : `Pay GH₵ ${order?.total?.toFixed(2)} with ${paymentMethod === 'hubtel' ? 'Hubtel' : 'Moolre'}`}
            </>
          )}
        </button>

        {/* Security Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center">
            <i className="ri-lock-line mr-1"></i>
            Secure payment · Mobile Money / Cards
          </p>
        </div>

        {/* Help Link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Having issues? <Link href="/contact" className="text-gray-900 hover:underline">Contact Support</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

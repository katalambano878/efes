'use client';

import { useEffect, useState } from 'react';
import type { AppliedCoupon } from '@/context/CartContext';

interface AvailableCoupon {
  code: string;
  description: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimumPurchase: number;
  maximumDiscount: number | null;
}

interface AdvancedCouponSystemProps {
  subtotal: number;
  onApply: (coupon: AppliedCoupon) => void;
  onRemove: () => void;
  appliedCoupon: AppliedCoupon | null;
}

function describe(c: AvailableCoupon): string {
  if (c.description) return c.description;
  if (c.type === 'percentage') {
    const cap = c.maximumDiscount ? ` (max GH₵${c.maximumDiscount})` : '';
    const min = c.minimumPurchase ? ` on orders over GH₵${c.minimumPurchase}` : '';
    return `${c.value}% off${cap}${min}`;
  }
  if (c.type === 'fixed_amount') {
    const min = c.minimumPurchase ? ` on orders over GH₵${c.minimumPurchase}` : '';
    return `GH₵${c.value} off${min}`;
  }
  return 'Free shipping';
}

export default function AdvancedCouponSystem({
  subtotal,
  onApply,
  onRemove,
  appliedCoupon,
}: AdvancedCouponSystemProps) {
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/storefront/coupons')
      .then((r) => r.json())
      .then((d) => {
        if (active && Array.isArray(d.coupons)) setAvailableCoupons(d.coupons);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const validateAndApply = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/storefront/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || 'Invalid coupon code');
        return;
      }
      onApply(data.coupon as AppliedCoupon);
      setCouponCode('');
      setShowAvailable(false);
    } catch {
      setError('Could not validate coupon. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!appliedCoupon ? (
        <>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Have a coupon code?
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && couponCode.trim()) validateAndApply(couponCode.trim());
                }}
                placeholder="Enter code"
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
              />
              <button
                onClick={() => couponCode.trim() && validateAndApply(couponCode.trim())}
                disabled={loading || !couponCode.trim()}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {loading ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 mt-2 flex items-center">
                <i className="ri-error-warning-line mr-1"></i>
                {error}
              </p>
            )}
          </div>

          {availableCoupons.length > 0 && (
            <>
              <button
                onClick={() => setShowAvailable(!showAvailable)}
                className="text-sm text-gray-900 hover:text-gray-700 font-medium flex items-center whitespace-nowrap cursor-pointer"
              >
                <i className={`ri-arrow-${showAvailable ? 'up' : 'down'}-s-line mr-1`}></i>
                {showAvailable ? 'Hide' : 'View'} available coupons
              </button>

              {showAvailable && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {availableCoupons.map((coupon) => {
                    const isEligible = !coupon.minimumPurchase || subtotal >= coupon.minimumPurchase;
                    const needed = coupon.minimumPurchase ? coupon.minimumPurchase - subtotal : 0;

                    return (
                      <div
                        key={coupon.code}
                        className={`bg-white rounded-lg p-4 border-2 transition-all ${
                          isEligible ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-lg font-bold text-sm">
                              {coupon.code}
                            </span>
                            {!isEligible && (
                              <span className="text-xs text-gray-500">Add GH₵{needed.toFixed(2)} more</span>
                            )}
                          </div>
                          {isEligible && (
                            <button
                              onClick={() => validateAndApply(coupon.code)}
                              disabled={loading}
                              className="text-gray-900 hover:text-gray-700 font-semibold text-sm whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{describe(coupon)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <i className="ri-price-tag-3-fill text-gray-900"></i>
                <span className="font-bold text-gray-800">{appliedCoupon.code}</span>
              </div>
              <p className="text-sm text-gray-900">{appliedCoupon.description || describe(appliedCoupon as AvailableCoupon)}</p>
            </div>
            <button
              onClick={onRemove}
              className="w-8 h-8 flex items-center justify-center text-gray-900 hover:text-red-600 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

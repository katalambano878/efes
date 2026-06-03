import type { Metadata } from 'next';
import Link from 'next/link';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Efescloset';
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Shipping & Delivery',
  description: `Shipping and delivery information for ${siteName}. Standard and express delivery options across Ghana. Free shipping on qualifying orders.`,
  alternates: { canonical: `${siteUrl}/shipping` },
};

export default function ShippingPage() {
  const deliveryOptions = [
    {
      type: 'Standard Delivery',
      time: 'Same Day / Next Day',
      cost: 'GHS 20',
      description: 'Order before 10am for same-day delivery, after 10am for next-day delivery',
      icon: 'ri-truck-line'
    },
    {
      type: 'Express Delivery',
      time: 'Priority Same Day',
      cost: 'GHS 40',
      description: 'Priority same-day delivery for Accra & Kumasi orders placed before 10am',
      icon: 'ri-rocket-line'
    },
    {
      type: 'Store Pickup',
      time: 'Same Day',
      cost: 'FREE',
      description: 'Collect from our East Legon store',
      icon: 'ri-store-2-line'
    }
  ];

  const zones = [
    {
      zone: 'Zone 1 - Accra Metro',
      areas: 'East Legon, Osu, Labone, Airport, Dzorwulu, Cantonments, Adabraka, Tema',
      standard: 'Same day (by 10am) / Next day',
      express: 'Same day'
    },
    {
      zone: 'Zone 2 - Greater Accra',
      areas: 'Zone 2 delivery areas',
      standard: 'Same day (by 10am) / Next day',
      express: 'Same day'
    },
    {
      zone: 'Zone 3 - Major Cities',
      areas: 'Kumasi, Takoradi, Cape Coast, Tamale, Sunyani, Ho, Koforidua',
      standard: 'Next day',
      express: 'Same day / Next day'
    },
    {
      zone: 'Zone 4 - Other Areas',
      areas: 'All other locations within Ghana',
      standard: 'Next day',
      express: 'Not available'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-gray-100 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Shipping & Delivery</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Fast, reliable delivery across Ghana. Free standard shipping on orders over GHS 300.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Delivery Options</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {deliveryOptions.map((option, index) => (
              <div key={index} className="bg-white border-2 border-gray-200 p-8 rounded-2xl hover:border-gray-600 hover:shadow-lg transition-all">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <i className={`${option.icon} text-2xl text-gray-900`}></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{option.type}</h3>
                <div className="text-gray-900 font-bold text-xl mb-2">{option.cost}</div>
                <div className="text-gray-600 font-medium mb-4">{option.time}</div>
                <p className="text-gray-600 leading-relaxed">{option.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-100 border-2 border-gray-200 rounded-2xl p-8 mb-16 text-center">
          <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-gift-line text-3xl text-white"></i>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Free Standard Shipping</h3>
          <p className="text-lg text-gray-600">
            Spend GHS 300 or more and get <span className="font-bold text-gray-900">FREE standard delivery</span> anywhere in Ghana
          </p>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Delivery Zones & Timeframes</h2>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Zone</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Areas Covered</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Standard</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Express</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {zones.map((zone, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{zone.zone}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">{zone.areas}</td>
                      <td className="px-6 py-4 text-gray-900">{zone.standard}</td>
                      <td className="px-6 py-4 text-gray-900">{zone.express}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How Shipping Works</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="font-bold text-gray-900">1</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">Order Processing</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Orders placed before 10am are delivered the same day. Orders placed after 10am are delivered the next day. We carefully pack your items and prepare them for dispatch.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="font-bold text-gray-900">2</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">Dispatch</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Your order is handed to our trusted delivery partner. You'll receive a tracking number via email and SMS.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="font-bold text-gray-900">3</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">Track Your Order</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Use your tracking number to monitor your delivery in real-time. You'll get updates at each stage.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="font-bold text-gray-900">4</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">Delivery</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Our delivery partner will contact you before arrival. Sign for your package and enjoy your purchase!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Important Information</h2>
            <div className="bg-gray-50 rounded-2xl p-6 space-y-6">
              <div>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <i className="ri-time-line text-gray-900"></i>
                  Cut-off Times
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  Order before 10am and your package is delivered the same day. Orders placed after 10am are delivered the next day.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <i className="ri-calendar-line text-gray-900"></i>
                  Business Days
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  Delivery timeframes exclude weekends and public holidays. We process orders Monday to Friday.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <i className="ri-phone-line text-gray-900"></i>
                  Delivery Contact
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  Our delivery partner will call you before arrival. Please ensure your phone number is correct and reachable.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <i className="ri-home-line text-gray-900"></i>
                  Failed Deliveries
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  If you're unavailable, we'll attempt delivery twice. After that, the package is held at a collection point for 5 days.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <i className="ri-secure-payment-line text-gray-900"></i>
                  Package Security
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm">
                  All packages are insured during transit. Report any damage or missing items within 48 hours of delivery.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Order Tracking</h2>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Track your order anytime using your order number and email address. You'll see real-time updates including:
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-checkbox-circle-line text-2xl text-blue-700"></i>
              </div>
              <p className="font-medium text-gray-900">Order Confirmed</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-package-line text-2xl text-amber-700"></i>
              </div>
              <p className="font-medium text-gray-900">Processing</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-truck-line text-2xl text-purple-700"></i>
              </div>
              <p className="font-medium text-gray-900">Out for Delivery</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-gift-line text-2xl text-gray-900"></i>
              </div>
              <p className="font-medium text-gray-900">Delivered</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/order-tracking"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-full font-medium hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              <i className="ri-map-pin-line"></i>
              Track Your Order
            </Link>
          </div>
        </div>

        <div className="border-t border-b border-gray-200 py-20 px-8 text-center bg-gray-50/50">
          <h2 className="text-3xl font-serif tracking-wide text-gray-900 mb-4">Need Help with Your Delivery?</h2>
          <p className="text-gray-500 mb-10 max-w-lg mx-auto text-sm tracking-wide leading-relaxed">
            Questions about shipping costs, delivery times, or tracking? Our customer service team is here to help.
          </p>
          <div className="flex flex-wrap gap-6 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center bg-black text-white px-8 py-4 text-xs font-bold uppercase tracking-widest rounded-none hover:bg-gray-800 transition-colors whitespace-nowrap border border-black"
            >
              Contact Support
            </Link>
            <Link
              href="/faqs"
              className="inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 text-xs font-bold uppercase tracking-widest rounded-none hover:bg-gray-50 transition-colors whitespace-nowrap border border-gray-200"
            >
              View FAQs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function ReturnConfirmationPage() {
  const returnId = `EXC-2024-${Math.floor(Math.random() * 10000)}`;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-check-line text-4xl text-gray-900"></i>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">Exchange Request Submitted!</h1>
            <p className="text-gray-600 mb-2">Your exchange request has been successfully submitted</p>
            <p className="text-sm text-gray-500 mb-8">
              Exchange ID: <span className="font-semibold">{returnId}</span>
            </p>

            <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl text-left">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center">
                <i className="ri-mail-line text-2xl text-blue-700 mr-2"></i>
                Check Your Email
              </h2>
              <p className="text-sm text-gray-700 mb-3">
                We've sent you an email with:
              </p>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start space-x-2">
                  <i className="ri-checkbox-circle-fill text-gray-700 mt-0.5"></i>
                  <span>Your exchange request confirmation</span>
                </li>
                <li className="flex items-start space-x-2">
                  <i className="ri-checkbox-circle-fill text-gray-700 mt-0.5"></i>
                  <span>Instructions for swapping your item</span>
                </li>
                <li className="flex items-start space-x-2">
                  <i className="ri-checkbox-circle-fill text-gray-700 mt-0.5"></i>
                  <span>Our store location and contact details</span>
                </li>
                <li className="flex items-start space-x-2">
                  <i className="ri-checkbox-circle-fill text-gray-700 mt-0.5"></i>
                  <span>Your exchange reference number</span>
                </li>
              </ul>
            </div>

            <div className="mb-8 text-left">
              <h2 className="font-bold text-gray-900 mb-4">What happens next?</h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                    <span className="font-bold text-gray-900">1</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Check Your Email</p>
                    <p className="text-sm text-gray-600">Review your exchange confirmation and instructions</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                    <span className="font-bold text-gray-900">2</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Keep Your Items Ready</p>
                    <p className="text-sm text-gray-600">Keep items unused, in original packaging with all tags</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                    <span className="font-bold text-gray-900">3</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">We Confirm Your Exchange</p>
                    <p className="text-sm text-gray-600">Our team reviews your request and arranges the swap</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                    <span className="font-bold text-gray-900">4</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Get Your Replacement</p>
                    <p className="text-sm text-gray-600">Receive your exchanged item — remember, no refunds, exchanges only</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/account"
                className="block w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Track Return Status
              </Link>
              <Link
                href="/shop"
                className="block w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Continue Shopping
              </Link>
              <Link
                href="/support/ticket"
                className="block text-gray-900 hover:text-gray-800 font-semibold whitespace-nowrap"
              >
                Need Help? Contact Support
              </Link>
            </div>
          </div>

          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-start space-x-3">
              <i className="ri-alert-line text-2xl text-amber-700 mt-0.5"></i>
              <div>
                <p className="font-semibold text-amber-900 mb-2">Important Reminders</p>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Exchanges must be requested within 24 hours of purchase</li>
                  <li>• Items must be unused with original tags</li>
                  <li>• We do not offer refunds — exchanges only</li>
                  <li>• Keep your exchange reference number for reference</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

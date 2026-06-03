'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { sanitizeHtml } from '@/lib/sanitize';

const articles: any = {
  '1': {
    id: 1,
    title: 'How do I track my order?',
    category: 'Orders & Delivery',
    views: 1247,
    helpful: 234,
    updated: 'January 15, 2024',
    content: `
      <h2>Tracking Your Order</h2>
      <p>We make it easy to track your order every step of the way. Here's how:</p>
      
      <h3>Method 1: Track via Email</h3>
      <ol>
        <li>Check your email for the order confirmation</li>
        <li>Click on the "Track Order" button in the email</li>
        <li>You'll be redirected to the tracking page with real-time updates</li>
      </ol>
      
      <h3>Method 2: Track on Website</h3>
      <ol>
        <li>Go to the <a href="/order-tracking">Order Tracking</a> page</li>
        <li>Enter your order number and email address</li>
        <li>Click "Track Order" to see your delivery status</li>
      </ol>
      
      <h3>Method 3: Track in Your Account</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Go to "Order History"</li>
        <li>Click on any order to see detailed tracking information</li>
      </ol>
      
      <h2>Understanding Tracking Statuses</h2>
      <ul>
        <li><strong>Order Confirmed:</strong> We've received your order</li>
        <li><strong>Processing:</strong> We're preparing your items</li>
        <li><strong>Packaged:</strong> Your order has been packaged</li>
        <li><strong>Dispatched To Rider:</strong> Your package has been sent to the rider for delivery</li>
        <li><strong>Out for Delivery:</strong> Your order is on its way</li>
        <li><strong>Delivered:</strong> Your order has been delivered</li>
      </ul>
      
      <h2>Need More Help?</h2>
      <p>If you can't find your tracking information or have questions about your delivery, please <a href="/support/ticket">contact our support team</a>.</p>
    `
  },
  '6': {
    id: 6,
    title: 'How do I exchange an item?',
    category: 'Exchanges',
    views: 2341,
    helpful: 456,
    updated: 'January 20, 2024',
    content: `
      <h2>Our Exchange Process</h2>
      <p>We want you to love your purchase! Please note: we do not offer refunds — we only accept exchanges, and they must be requested within 24 hours of purchase.</p>
      
      <h3>Step 1: Start Your Exchange</h3>
      <ol>
        <li>Go to the <a href="/returns">Exchange Portal</a></li>
        <li>Enter your order number and email</li>
        <li>Select the items you want to exchange</li>
        <li>Choose an exchange reason</li>
      </ol>
      
      <h3>Step 2: Submit Within 24 Hours</h3>
      <p>Your exchange request must be submitted within 24 hours of purchase. After 24 hours, we can no longer process an exchange.</p>
      
      <h3>Step 3: Keep Your Item Ready</h3>
      <p>Keep your item unused and in its original packaging with all tags attached so we can complete the exchange.</p>
      
      <h3>Step 4: Get Your Replacement</h3>
      <p>Once we confirm your exchange, we'll arrange the swap for a different size, colour, or product. Remember — we offer exchanges only, no refunds.</p>
      
      <h2>Exchange Policy Details</h2>
      <ul>
        <li>No refunds — exchanges only</li>
        <li>Exchanges must be requested within 24 hours of purchase</li>
        <li>Items must be unused and in original packaging with tags</li>
        <li>After 24 hours, exchanges can no longer be processed</li>
      </ul>
    `
  }
};

const relatedArticles = [
  { id: 7, title: 'What is your exchange policy?', category: 'Exchanges' },
  { id: 8, title: 'How long do I have to request an exchange?', category: 'Exchanges' },
  { id: 9, title: 'Do you offer refunds?', category: 'Exchanges' },
  { id: 10, title: 'How do I request an exchange?', category: 'Exchanges' }
];

export default function ArticlePage() {
  const params = useParams();
  const articleId = params.id as string;
  const article = articles[articleId] || articles['1'];
  
  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleHelpful = (helpful: boolean) => {
    setWasHelpful(helpful);
    setShowFeedback(true);
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href="/help"
            className="inline-flex items-center text-gray-900 hover:text-gray-900 font-semibold mb-6 whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Help Center
          </Link>

          <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
            <div className="mb-6 pb-6 border-b border-gray-200">
              <div className="flex items-center space-x-3 mb-4">
                <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-sm font-semibold whitespace-nowrap">
                  {article.category}
                </span>
                <span className="text-sm text-gray-500">
                  Updated {article.updated}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <i className="ri-eye-line"></i>
                  <span>{article.views.toLocaleString()} views</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="ri-thumb-up-line"></i>
                  <span>{article.helpful} found this helpful</span>
                </div>
              </div>
            </div>

            <article
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
              style={{
                lineHeight: '1.8'
              }}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Was this article helpful?</h3>
            {!showFeedback ? (
              <div className="flex space-x-4">
                <button
                  onClick={() => handleHelpful(true)}
                  className="flex-1 py-3 px-6 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  <i className="ri-thumb-up-line mr-2"></i>
                  Yes, it was helpful
                </button>
                <button
                  onClick={() => handleHelpful(false)}
                  className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  <i className="ri-thumb-down-line mr-2"></i>
                  No, I need more help
                </button>
              </div>
            ) : (
              <div className="text-center">
                {wasHelpful ? (
                  <>
                    <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-4">
                      <i className="ri-check-line text-3xl text-gray-900"></i>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Thank you for your feedback!
                    </p>
                    <p className="text-gray-600">
                      We're glad we could help. Have a great day!
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 flex items-center justify-center bg-blue-100 rounded-full mx-auto mb-4">
                      <i className="ri-customer-service-line text-3xl text-blue-700"></i>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Sorry we couldn't help
                    </p>
                    <p className="text-gray-600 mb-4">
                      Our support team is here for you!
                    </p>
                    <Link
                      href="/support/ticket"
                      className="inline-block bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                    >
                      Contact Support
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
            <div className="space-y-3">
              {relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/help/article/${related.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <i className="ri-file-text-line text-xl text-gray-900"></i>
                    <div>
                      <p className="font-semibold text-gray-900">{related.title}</p>
                      <p className="text-sm text-gray-600">{related.category}</p>
                    </div>
                  </div>
                  <i className="ri-arrow-right-s-line text-2xl text-gray-400"></i>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

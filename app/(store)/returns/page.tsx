'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
const mockOrders = [
  {
    id: 'ORD-2024-156',
    date: '2024-01-20',
    items: [
      {
        id: 1,
        name: 'Premium Leather Crossbody Bag',
        price: 289,
        image: '/placeholder.jpg',
        returnable: true
      },
      {
        id: 2,
        name: 'Minimalist Ceramic Vase Set',
        price: 159,
        image: '/placeholder.jpg',
        returnable: true
      }
    ]
  }
];

export default function ReturnsPortalPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [returnReasons, setReturnReasons] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [foundOrder, setFoundOrder] = useState<any>(null);

  const reasons = [
    'Wrong size/fit',
    'Wrong item received',
    'Defective/damaged item',
    'Not as described',
    'Other'
  ];

  const handleFindOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setFoundOrder(mockOrders[0]);
      setIsLoading(false);
      setStep(2);
    }, 1000);
  };

  const toggleItemSelection = (itemId: number) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSubmitReturn = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      router.push('/returns/confirmation');
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Exchange Portal</h1>
          <p className="text-gray-600 mb-8">Request an exchange within 24 hours of purchase. Please note: we do not offer refunds — exchanges only.</p>

          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-full font-bold ${
                    i <= step ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i < step ? <i className="ri-check-line"></i> : i}
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-1 mx-4 ${
                      i < step ? 'bg-gray-700' : 'bg-gray-200'
                    }`}></div>
                  )}
                </div>
              ))}
            </div>
              <div className="flex justify-between mt-2">
              <span className="text-sm font-semibold text-gray-900">Find Order</span>
              <span className="text-sm font-semibold text-gray-900">Select Items</span>
              <span className="text-sm font-semibold text-gray-900">Submit Exchange</span>
            </div>
          </div>

          {step === 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Find Your Order</h2>
              <form onSubmit={handleFindOrder} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Order Number *
                  </label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                    placeholder="ORD-2024-156"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? 'Finding Order...' : 'Find Order'}
                </button>
              </form>

              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <i className="ri-information-line text-xl text-blue-700 mt-0.5"></i>
                  <div className="text-sm text-blue-700">
                    <p className="font-semibold mb-1">Exchange Policy Highlights</p>
                    <ul className="space-y-1">
                      <li>• No refunds — exchanges only</li>
                      <li>• Exchanges accepted within 24 hours of purchase</li>
                      <li>• Items must be unused with original tags</li>
                      <li>• After 24 hours, exchanges can no longer be processed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && foundOrder && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Items to Exchange</h2>
              
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Order #{foundOrder.id} • Placed on {foundOrder.date}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                {foundOrder.items.map((item: any) => (
                  <div key={item.id} className="border-2 border-gray-200 rounded-lg p-4">
                    <div className="flex items-start space-x-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="mt-1 w-5 h-5 text-gray-900 rounded border-gray-300 focus:ring-gray-900"
                      />
                      <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover object-top" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 mb-1">{item.name}</p>
                        <p className="text-lg font-bold text-gray-900 mb-3">GH₵{item.price.toFixed(2)}</p>
                        
                        {selectedItems.includes(item.id) && (
                          <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900 mb-2">
                              Reason for exchange *
                            </label>
                            <select
                              value={returnReasons[item.id] || ''}
                              onChange={(e) => setReturnReasons({
                                ...returnReasons,
                                [item.id]: e.target.value
                              })}
                              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 pr-8"
                              required
                            >
                              <option value="">Select a reason</option>
                              {reasons.map((reason) => (
                                <option key={reason} value={reason}>{reason}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  What happens next?
                </label>
                <div className="p-4 rounded-lg border-2 border-gray-900 bg-gray-100 text-left">
                  <i className="ri-exchange-line text-2xl text-gray-900 mb-2"></i>
                  <p className="font-semibold text-gray-900">Exchange Item</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Get a different size, colour, or product. We do not offer refunds — exchanges only, and your request must be made within 24 hours of purchase.
                  </p>
                </div>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedItems.length === 0 || !selectedItems.every(id => returnReasons[id])}
                  className="flex-1 py-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Review & Submit</h2>

              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 mb-4">Exchange Summary</h3>
                <div className="space-y-3">
                  {foundOrder.items
                    .filter((item: any) => selectedItems.includes(item.id))
                    .map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-600">Reason: {returnReasons[item.id]}</p>
                        </div>
                        <p className="font-bold text-gray-900">GH₵{item.price.toFixed(2)}</p>
                      </div>
                    ))}
                </div>
              </div>

              <div className="mb-8 p-6 border-2 border-gray-200 bg-gray-100 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-4">Next Steps</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">1.</span>
                    <span>Submit your exchange request within 24 hours of purchase</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">2.</span>
                    <span>Keep items unused and in original packaging with tags</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">3.</span>
                    <span>Our team will confirm your exchange and arrange the swap</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">4.</span>
                    <span>Remember: we offer exchanges only — no refunds</span>
                  </li>
                </ol>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitReturn}
                  disabled={isLoading}
                  className="flex-1 py-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? 'Submitting...' : 'Submit Exchange Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
  );
}

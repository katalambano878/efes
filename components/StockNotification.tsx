'use client';

interface StockNotificationProps {
  stockCount: number;
  threshold?: number;
  viewCount?: number;
}

export default function StockNotification({ stockCount, threshold = 10, viewCount }: StockNotificationProps) {
  const isLowStock = stockCount <= threshold;
  const isVeryLowStock = stockCount <= 5;

  return (
    <div className="space-y-2">
      {isLowStock && (
        <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
          isVeryLowStock 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            isVeryLowStock ? 'bg-red-500' : 'bg-amber-500'
          }`}></div>
          <span className={`text-sm font-semibold ${
            isVeryLowStock ? 'text-red-700' : 'text-amber-700'
          }`}>
            {isVeryLowStock ? '🔥 ' : '⚠️ '}
            Only {stockCount} left in stock - Order soon!
          </span>
        </div>
      )}

      {viewCount && viewCount > 50 && (
        <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
          <div className="w-6 h-6 flex items-center justify-center bg-purple-500 rounded-full">
            <i className="ri-eye-fill text-white text-xs"></i>
          </div>
          <span className="text-sm font-semibold text-purple-700">
            🔥 {viewCount.toLocaleString()} people viewed this today
          </span>
        </div>
      )}

      {viewCount && viewCount > 200 && (
        <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white">
          <div className="w-6 h-6 flex items-center justify-center bg-white/20 rounded-full animate-pulse">
            <i className="ri-fire-fill text-sm"></i>
          </div>
          <span className="text-sm font-bold">
            🔥 TRENDING NOW - Hot Item!
          </span>
        </div>
      )}
    </div>
  );
}

export default function ProductCardSkeleton() {
  return (
    <div className="flex flex-col h-full bg-white rounded-[1.5rem] border border-gray-100 p-3 lg:p-4 animate-pulse">
      {/* Image Skeleton */}
      <div className="relative aspect-[4/5] bg-[#F9F9F9] rounded-2xl overflow-hidden mb-5">
        <div className="absolute inset-0 bg-gradient-to-r from-[#F9F9F9] via-[#F0F0F0] to-[#F9F9F9] animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
      </div>

      {/* Content Skeleton */}
      <div className="flex flex-col flex-grow text-center items-center px-2">
        {/* Title */}
        <div className="h-4 bg-gray-200 w-3/4 mb-3 rounded-full"></div>
        <div className="h-4 bg-gray-200 w-1/2 mb-4 rounded-full"></div>

        {/* Color Swatches */}
        <div className="flex justify-center gap-1.5 mb-4">
          <div className="w-3 h-3 rounded-full bg-gray-200"></div>
          <div className="w-3 h-3 rounded-full bg-gray-200"></div>
        </div>

        {/* Price */}
        <div className="mt-auto h-4 bg-gray-200 w-20 mb-2 rounded-full"></div>

        {/* Button (Mobile) */}
        <div className="mt-4 w-full lg:hidden">
          <div className="h-[42px] border border-gray-100 bg-gray-50 rounded-full w-full mb-1"></div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoading() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-gray-500">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}

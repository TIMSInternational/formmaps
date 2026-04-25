export function LoadingSpinner() {
  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" aria-hidden="true"></div>
        <p className="text-gray-600 text-lg font-medium" aria-hidden="true">Loading...</p>
        <span className="sr-only">Loading content, please wait...</span>
      </div>
    </div>
  );
}

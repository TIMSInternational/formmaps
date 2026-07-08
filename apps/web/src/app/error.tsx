"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/sentry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-7xl font-bold text-red-500 mb-4">500</h1>
        <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-8">
          An unexpected error occurred. Our team has been notified.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-[#2E9098] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#247379] transition-colors"
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

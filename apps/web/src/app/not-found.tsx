import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-7xl font-bold text-[#2E9098] mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-[#2E9098] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#256F76] transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}

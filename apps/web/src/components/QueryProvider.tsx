'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

let _queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient | null {
  return _queryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: process.env.NODE_ENV === 'production',
          },
        },
      });
      _queryClient = client;
      return client;
    }
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* React Query Devtools — uncomment to re-enable */}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}
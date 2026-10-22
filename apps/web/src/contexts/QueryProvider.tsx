"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Default cache policy for the app.
 *
 * Mutations never retry automatically: an optimistic update has already been
 * shown (and, on failure, rolled back), so silently replaying a wallet-signed
 * transaction is never safe. Queries keep a short stale window so navigations
 * feel instant while still refreshing in the background.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

interface QueryProviderProps {
  children: ReactNode;
  /** Injectable client so tests can assert on the same cache the app uses. */
  client?: QueryClient;
}

export function QueryProvider({ children, client }: QueryProviderProps) {
  // Created lazily and kept for the lifetime of the mount so the cache is not
  // recreated on every render.
  const [queryClient] = useState(() => client ?? createQueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

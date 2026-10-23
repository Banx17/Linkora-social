import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** A promise the test can resolve or reject explicitly. */
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * QueryClient with retries disabled: optimistic rollback assertions must see
 * the first failure, not a retried one.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function wrapperFor(client: QueryClient) {
  return function QueryWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

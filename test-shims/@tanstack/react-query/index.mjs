import React from "../react/index.js";

let currentClient = null;

export class QueryClient {
  constructor() {
    this.store = new Map();
  }

  setQueryData(key, value) {
    this.store.set(JSON.stringify(key), value);
  }

  getQueryData(key) {
    return this.store.get(JSON.stringify(key));
  }

  async fetchQuery(options) {
    const key = options.queryKey;
    const cached = this.getQueryData(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = options.queryFn ? options.queryFn() : undefined;
    const resolved = await value;
    this.setQueryData(key, resolved);
    return resolved;
  }
}

export const QueryClientProvider = ({ client, children }) => {
  currentClient = client;
  const rendered = Array.isArray(children) ? children : [children];
  return rendered.length === 1 ? rendered[0] : rendered;
};

export const useQuery = (options) => {
  if (!currentClient) {
    throw new Error("QueryClientProvider is missing");
  }
  if (options.initialData !== undefined) {
    currentClient.setQueryData(options.queryKey, options.initialData);
    return {
      data: options.initialData,
      isPending: false,
      isError: false,
      error: null,
      refetch: () => {},
      isRefetching: false
    };
  }

  const data = currentClient.getQueryData(options.queryKey);
  if (data !== undefined) {
    return { data, isPending: false, isError: false, error: null, refetch: () => {}, isRefetching: false };
  }
  const value = options.queryFn ? options.queryFn() : undefined;
  if (value instanceof Promise) {
    throw new Error("Async query functions are not supported in this test shim");
  }
  currentClient.setQueryData(options.queryKey, value);
  return { data: value, isPending: false, isError: false, error: null, refetch: () => {}, isRefetching: false };
};

export const useMutation = (options = {}) => {
  const mutationFn = options.mutationFn ?? (() => undefined);
  const execute = async (input) => mutationFn(input);
  return {
    mutate: (input) => {
      try {
        execute(input);
      } catch {
        // ignore errors in stub
      }
    },
    mutateAsync: execute,
    isPending: false,
    isError: false,
    error: null
  };
};

export const useQueryClient = () => {
  if (!currentClient) {
    throw new Error("QueryClientProvider is missing");
  }
  return currentClient;
};

export default { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient };

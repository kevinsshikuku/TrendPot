const React = require("../../react");

let currentClient = null;

class QueryClient {
  constructor() {
    this.store = new Map();
  }

  setQueryData(key, value) {
    this.store.set(JSON.stringify(key), value);
  }

  getQueryData(key) {
    return this.store.get(JSON.stringify(key));
  }
}

const QueryClientProvider = ({ client, children }) => {
  currentClient = client;
  const rendered = Array.isArray(children) ? children : [children];
  return rendered.length === 1 ? rendered[0] : rendered;
};

const useQuery = (options) => {
  if (!currentClient) {
    throw new Error("QueryClientProvider is missing");
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

module.exports = {
  QueryClient,
  QueryClientProvider,
  useQuery
};

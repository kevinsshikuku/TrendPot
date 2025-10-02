const noop = () => undefined;

const createSpan = () => ({
  setStatus: noop,
  setAttribute: noop,
  addEvent: noop,
  recordException: noop,
  end: noop
});

export const SpanStatusCode = { OK: 1, ERROR: 2 };

export const trace = {
  getTracer: () => ({
    startSpan: () => createSpan()
  })
};

const createHistogram = () => ({ record: noop });
const createCounter = () => ({ add: noop });

export const metrics = {
  getMeter: () => ({
    createHistogram: () => createHistogram(),
    createCounter: () => createCounter()
  })
};

export default { trace, metrics, SpanStatusCode };

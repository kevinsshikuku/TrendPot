const noop = () => undefined;

const createSpan = () => ({
  setStatus: noop,
  setAttribute: noop,
  addEvent: noop,
  recordException: noop,
  end: noop
});

const SpanStatusCode = { OK: 1, ERROR: 2 };

const trace = {
  getTracer: () => ({
    startSpan: () => createSpan()
  })
};

const createHistogram = () => ({ record: noop });
const createCounter = () => ({ add: noop });

const metrics = {
  getMeter: () => ({
    createHistogram: () => createHistogram(),
    createCounter: () => createCounter()
  })
};

module.exports = { trace, metrics, SpanStatusCode };
module.exports.default = module.exports;

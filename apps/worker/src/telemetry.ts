import { metrics, trace } from "@opentelemetry/api";

const SERVICE_NAME = "trendpot-worker";

export const workerTracer = trace.getTracer(SERVICE_NAME);

const meter = metrics.getMeter(SERVICE_NAME);

export const financeReconciliationDurationHistogram = meter.createHistogram(
  "finance.reconciliation.duration_ms",
  {
    description: "Duration of finance reconciliation jobs"
  }
);

export const financeReconciliationDiscrepancyCounter = meter.createCounter(
  "finance.reconciliation.discrepancies",
  {
    description: "Number of reconciliation discrepancies detected"
  }
);

export const financeAlertCounter = meter.createCounter("finance.alerts.worker", {
  description: "Finance alerts emitted by the worker"
});

export const payoutFailureCounter = meter.createCounter("finance.payout.failures", {
  description: "Count of payout disbursement failures"
});

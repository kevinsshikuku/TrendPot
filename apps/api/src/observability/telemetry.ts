import { metrics, trace } from "@opentelemetry/api";

const SERVICE_NAME = "trendpot-api";

export const apiTracer = trace.getTracer(SERVICE_NAME);

const meter = metrics.getMeter(SERVICE_NAME);

export const donationSplitHistogram = meter.createHistogram("donations.split.amount_cents", {
  description: "Gross amount of STK donations processed during callbacks"
});

export const donationLedgerDurationHistogram = meter.createHistogram("donations.ledger.duration_ms", {
  description: "Duration spent posting donation ledger entries"
});

export const donationLedgerCounter = meter.createCounter("donations.ledger.postings", {
  description: "Total donation ledger postings recorded"
});

export const adminDonationQueryHistogram = meter.createHistogram("donations.admin.list.duration_ms", {
  description: "Duration for admin donation listing queries"
});

export const adminDonationMetricsHistogram = meter.createHistogram("donations.admin.metrics.duration_ms", {
  description: "Duration for admin donation metrics aggregation"
});

export const financeAlertCounter = meter.createCounter("finance.alerts.emitted", {
  description: "Finance alerts emitted by the API"
});

import { dispatchAlert } from "@trendpot/utils";
import { workerLogger } from "../logger";
import { financeAlertCounter } from "../telemetry";

const alertsWebhookUrl = process.env.FINANCE_ALERTS_WEBHOOK_URL;
const alertLogger = workerLogger.child({ module: "FinanceAlerts" });

export interface FinanceAlertPayload {
  event: string;
  severity: "info" | "warning" | "critical";
  message: string;
  context?: Record<string, unknown>;
}

export const sendFinanceAlert = async (payload: FinanceAlertPayload) => {
  financeAlertCounter.add(1, { source: "worker" });
  await dispatchAlert(payload, {
    webhookUrl: alertsWebhookUrl,
    logger: alertLogger
  });
};

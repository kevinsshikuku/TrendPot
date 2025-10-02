export interface AlertPayload {
  event: string;
  severity: "info" | "warning" | "critical";
  message: string;
  context?: Record<string, unknown>;
}

export interface AlertDispatchOptions {
  webhookUrl?: string | null;
  logger?: {
    info?: (obj: Record<string, unknown>, msg?: string) => void;
    warn?: (obj: Record<string, unknown>, msg?: string) => void;
    error?: (obj: Record<string, unknown>, msg?: string) => void;
  };
  timeoutMs?: number;
}

export interface AlertDispatchResult {
  delivered: boolean;
  status?: number;
  error?: string;
}

const defaultHeaders = {
  "content-type": "application/json"
};

export const dispatchAlert = async (
  payload: AlertPayload,
  options: AlertDispatchOptions = {}
): Promise<AlertDispatchResult> => {
  const { webhookUrl, logger, timeoutMs = 5_000 } = options;

  const logContext = {
    event: payload.event,
    severity: payload.severity,
    ...payload.context
  };

  if (!webhookUrl) {
    logger?.warn?.(
      { ...logContext, delivered: false, reason: "missing_webhook" },
      "Finance alert webhook not configured"
    );
    return { delivered: false, error: "missing_webhook" };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: defaultHeaders,
      signal: controller.signal
    });

    if (!response.ok) {
      const error = `Alert webhook returned status ${response.status}`;
      logger?.error?.({ ...logContext, delivered: false, status: response.status }, error);
      return { delivered: false, status: response.status, error };
    }

    logger?.info?.(
      { ...logContext, delivered: true, status: response.status },
      "Finance alert dispatched"
    );
    return { delivered: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    logger?.error?.({ ...logContext, delivered: false, error: message }, "Failed to dispatch finance alert");
    return { delivered: false, error: message };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

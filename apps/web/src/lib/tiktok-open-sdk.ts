const SDK_FALLBACK_ERROR =
  "TikTok OpenSDK is not available. Ensure the SDK script has loaded before launching login.";

interface TikTokLoginIntent {
  state: string;
  clientKey: string;
  redirectUri: string;
  scopes: string[];
}

type MaybePromise<T> = T | Promise<T>;

type TikTokLoginInvoker = (options: {
  client_key: string;
  redirect_uri: string;
  state: string;
  scope?: string;
}) => MaybePromise<unknown>;

function resolveInvoker(): TikTokLoginInvoker | null {
  if (typeof window === "undefined") {
    return null;
  }

  const globalObject = window as typeof window & {
    TiktokOpenSDK?: unknown;
    TikTokOpenSDK?: unknown;
    TTLogin?: unknown;
  };

  const candidates = [globalObject.TiktokOpenSDK, globalObject.TikTokOpenSDK, globalObject.TTLogin];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (typeof candidate === "function") {
      return candidate as TikTokLoginInvoker;
    }

    if (typeof candidate === "object" && candidate !== null) {
      const maybeLogin = (candidate as { login?: TikTokLoginInvoker }).login;
      if (typeof maybeLogin === "function") {
        return maybeLogin.bind(candidate) as TikTokLoginInvoker;
      }
    }
  }

  return null;
}

export async function launchTikTokLogin(intent: TikTokLoginIntent) {
  const invoker = resolveInvoker();

  if (!invoker) {
    throw new Error(SDK_FALLBACK_ERROR);
  }

  const scope = intent.scopes.length > 0 ? intent.scopes.join(",") : undefined;
  await invoker({
    client_key: intent.clientKey,
    redirect_uri: intent.redirectUri,
    state: intent.state,
    scope
  });
}

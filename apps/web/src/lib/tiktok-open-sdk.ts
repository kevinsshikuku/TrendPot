const SDK_FALLBACK_ERROR =
  "TikTok OpenSDK is not available. Ensure the SDK script has loaded before launching login.";
const SDK_LOAD_ERROR =
  "We couldn't load TikTok's login tools. Please check your connection and try again.";
const SDK_SCRIPT_URL = "https://www.tiktok.com/auth/opensdk.js";
const SDK_SCRIPT_SELECTOR = 'script[data-tiktok-open-sdk="true"]';

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

let sdkLoadPromise: Promise<void> | null = null;

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

export function loadTikTokOpenSDK(clientKey: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  if (resolveInvoker()) {
    return Promise.resolve();
  }

  const existingScript = document.querySelector<HTMLScriptElement>(SDK_SCRIPT_SELECTOR);

  if (existingScript?.dataset.status === "ready") {
    return Promise.resolve();
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = existingScript ?? document.createElement("script");

    const handleResolve = () => {
      script.dataset.status = "ready";
      script.removeEventListener("load", handleResolve);
      script.removeEventListener("error", handleReject);
      resolve();
    };

    const handleReject = () => {
      script.dataset.status = "error";
      script.removeEventListener("load", handleResolve);
      script.removeEventListener("error", handleReject);

      if (!existingScript && script.parentNode) {
        script.parentNode.removeChild(script);
      }

      sdkLoadPromise = null;
      reject(new Error(SDK_LOAD_ERROR));
    };

    script.addEventListener("load", handleResolve);
    script.addEventListener("error", handleReject);

    if (!existingScript) {
      script.async = true;
      script.defer = true;
      script.src = `${SDK_SCRIPT_URL}?clientKey=${encodeURIComponent(clientKey)}`;
      script.setAttribute("data-tiktok-open-sdk", "true");
      script.dataset.status = "loading";
      document.head.appendChild(script);
    } else if (script.dataset.status !== "loading") {
      script.dataset.status = "loading";
    }

    if ((script as { readyState?: string }).readyState === "complete") {
      handleResolve();
    }
  });

  return sdkLoadPromise;
}

export async function launchTikTokLogin(intent: TikTokLoginIntent) {
  await loadTikTokOpenSDK(intent.clientKey);

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

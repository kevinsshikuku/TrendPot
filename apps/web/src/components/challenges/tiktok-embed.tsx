"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TikTokEmbed as TikTokEmbedPayload } from "@trendpot/types";

const scriptPromises = new Map<string, Promise<void>>();

function loadTikTokEmbedScript(src: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  if (scriptPromises.has(src)) {
    return scriptPromises.get(src)!;
  }

  const script = existing ?? document.createElement("script");

  const promise = new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    const handleError = () => {
      scriptPromises.delete(src);
      if (!existing) {
        script.remove();
      }
      reject(new Error(`Failed to load TikTok embed script from ${src}`));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });

  scriptPromises.set(src, promise);

  if (!existing) {
    script.async = true;
    script.src = src;
    document.body.appendChild(script);
  }

  return promise;
}

function invokeTikTokEmbedLoad() {
  if (typeof window === "undefined") {
    return;
  }

  const globalWithLoader = window as typeof window & { tiktokEmbedLoad?: () => void };
  if (typeof globalWithLoader.tiktokEmbedLoad === "function") {
    try {
      globalWithLoader.tiktokEmbedLoad();
    } catch (error) {
      console.error("TikTok embed loader threw", error);
    }
  }
}

export interface TikTokEmbedProps {
  embed: TikTokEmbedPayload;
  className?: string;
  loadingText?: string;
  errorText?: string;
}

export function TikTokEmbed({
  embed,
  className,
  loadingText = "Preparing TikTok embed…",
  errorText = "We couldn't load this TikTok embed."
}: TikTokEmbedProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => ({ __html: embed.html }), [embed.html]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setStatus("loading");
    let cancelled = false;

    loadTikTokEmbedScript(embed.scriptUrl)
      .then(() => {
        if (cancelled) {
          return;
        }
        setStatus("ready");
        invokeTikTokEmbedLoad();
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [embed.scriptUrl, embed.html]);

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" dangerouslySetInnerHTML={html} />
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-center text-sm text-slate-200">
          <span>{status === "error" ? errorText : loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/** Read the client-visible access_token_exp cookie (not httpOnly). */
function readAccessTokenExp(): Date | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith("access_token_exp="));
  if (!row) return null;
  const d = new Date(decodeURIComponent(row.split("=")[1]));
  return isNaN(d.getTime()) ? null : d;
}

// Module-level singletons — shared across re-renders.
let _originalFetch: typeof globalThis.fetch | null = null;
let _refreshing: Promise<boolean> | null = null;

function callRefreshEndpoint(): Promise<boolean> {
  if (_refreshing) return _refreshing;
  const fetcher = _originalFetch ?? globalThis.fetch;
  _refreshing = fetcher("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      _refreshing = null;
    });
  return _refreshing;
}

/**
 * Mounts inside the authenticated app layout.
 * - Proactively refreshes the access token ~60 s before it expires.
 * - Coordinates across tabs via BroadcastChannel so only one tab refreshes.
 * - Re-checks expiry on tab visibility change (handles sleep/resume).
 * - Patches window.fetch as a reactive fallback: retries once on 401.
 */
export function TokenRefresher() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to `schedule` so the visibility listener can call it.
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("aethera-auth")
        : null;

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current);

      const exp = readAccessTokenExp();
      if (!exp) {
        // Cookie is gone — token has already expired (or was never set).
        // Attempt a refresh immediately instead of going silent.
        doRefresh();
        return;
      }

      // Another tab may have already refreshed — re-read before acting.
      const msUntilRefresh = exp.getTime() - Date.now() - 60_000;

      if (msUntilRefresh <= 0) {
        doRefresh();
      } else {
        timerRef.current = setTimeout(doRefresh, msUntilRefresh);
      }
    }

    async function doRefresh() {
      // Re-read cookie: another tab may have refreshed while we were waiting.
      const exp = readAccessTokenExp();
      if (exp && exp.getTime() - Date.now() > 60_000) {
        // Token is still fresh (another tab already refreshed) — just reschedule.
        schedule();
        return;
      }

      const ok = await callRefreshEndpoint();
      if (ok) {
        channel?.postMessage({ type: "refreshed" });
        schedule();
      } else {
        window.location.href = "/login";
      }
    }

    scheduleRef.current = schedule;
    schedule();

    // When another tab successfully refreshes, reschedule our own timer.
    if (channel) {
      channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === "refreshed") {
          schedule();
        }
      };
    }

    // Re-check on tab focus/visibility (handles long sleep periods).
    function onVisible() {
      if (document.visibilityState === "visible") {
        schedule();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, []);

  // Patch window.fetch once — reactive fallback for any 401 that slips through.
  useEffect(() => {
    if (_originalFetch !== null) return; // already patched
    _originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const res = await _originalFetch!(input, init);
      if (res.status !== 401) return res;

      // Never intercept auth endpoints to avoid loops.
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/api/auth/")) return res;

      const ok = await callRefreshEndpoint();
      if (!ok) {
        window.location.href = "/login";
        return res;
      }
      // Retry the original request once with fresh cookies.
      return _originalFetch!(input, init);
    };
  }, []);

  return null;
}

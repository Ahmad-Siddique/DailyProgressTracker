"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { isQuickAddDirty } from "@/lib/pwa/idb";

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function shouldSkipServiceWorker() {
  return process.env.NODE_ENV === "development" || isLocalDevHost();
}

async function clearServiceWorkerCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

async function unregisterAllServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((reg) => reg.unregister()));
}

export function RegisterServiceWorker() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (shouldSkipServiceWorker()) {
      void (async () => {
        await unregisterAllServiceWorkers();
        await clearServiceWorkerCaches();
      })();
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        });
      })
      .catch(() => undefined);

    const onController = () => setWaiting(null);
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  function refresh() {
    if (isQuickAddDirty()) return;
    waiting?.postMessage({ type: "SKIP_WAITING" });
    setDismissed(false);
    window.location.reload();
  }

  if (shouldSkipServiceWorker() || !waiting || dismissed) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] border-b border-primary/20 bg-card/90 px-4 py-2.5 text-sm shadow-premium backdrop-blur-md"
      style={{ animation: "db-fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both" }}
      role="status"
      data-testid="sw-update-banner"
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 md:px-8 lg:px-10">
        <span className="font-medium text-foreground">
          <span className="text-primary">●</span> Update ready
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => refresh()}>
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDismissed(true)}
          >
            Later
          </Button>
        </div>
      </div>
      {isQuickAddDirty() ? (
        <p className="mt-1 px-4 text-xs text-muted-foreground md:px-8 lg:px-10">
          Finish or discard Quick Add before refreshing.
        </p>
      ) : null}
    </div>
  );
}
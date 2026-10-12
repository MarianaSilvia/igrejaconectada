"use client";

import { useEffect, useState } from "react";

export function PwaBoot() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const listenForUpdates = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateReady(true);
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setWaitingWorker(worker);
                setUpdateReady(true);
              }
            });
          });

          void registration.update();
        })
        .catch(() => {
          // A PWA continua funcionando como site normal caso o navegador bloqueie o registro.
        });
    };

    window.addEventListener("load", listenForUpdates);

    return () => {
      window.removeEventListener("load", listenForUpdates);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="pwa-update-banner" role="status">
      <span>Nova versão disponível.</span>
      <button
        onClick={() => {
          waitingWorker?.postMessage({ type: "SKIP_WAITING" });
          window.location.reload();
        }}
        type="button"
      >
        Atualizar app
      </button>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useState } from "react";

export function PwaBoot() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          // A PWA continua funcionando como site normal caso o navegador bloqueie o registro.
        });
    });
  }, []);

  if (!updateReady) return null;

  return (
    <div className="pwa-update-banner" role="status">
      <span>Nova versao disponivel.</span>
      <button onClick={() => window.location.reload()} type="button">
        Atualizar app
      </button>
    </div>
  );
}

"use client";

import { useEffect } from "react";

export function PwaBoot() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A PWA continua funcionando como site normal caso o navegador bloqueie o registro.
      });
    });
  }, []);

  return null;
}

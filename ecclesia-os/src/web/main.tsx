import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./theme-overrides.css";
import PublicRegistration from "./PublicRegistration";
import PublicAccess from "./PublicAccess";
import PublicEvent from "./PublicEvent";
import PublicGroups from "./PublicGroups";
import PublicCatalog from "./PublicCatalog";
import LandingPage from "./LandingPage";
import PublicMedia from "./PublicMedia";
const registrationPath = /^\/cadastro\/([^/]+)\/?$/.exec(
  window.location.pathname,
);
const eventPath = /^\/evento\/([^/]+)\/?$/.exec(window.location.pathname);
const groupsPath = /^\/grupos\/([^/]+)\/?$/.exec(window.location.pathname);
const catalogPath = /^\/catalogo\/([^/]+)\/?$/.exec(window.location.pathname);
const mediaPath = /^\/midia\/([^/]+)\/?$/.exec(window.location.pathname);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/^\/convite\//.test(window.location.pathname) ? (
      <PublicAccess
        kind="invite"
        token={window.location.pathname.split("/")[2]}
      />
    ) : /^\/recuperar\//.test(window.location.pathname) ? (
      <PublicAccess
        kind="recovery"
        token={window.location.pathname.split("/")[2]}
      />
    ) : window.location.pathname === "/recuperar-autenticador" ? (
      <PublicAccess kind="mfa" />
    ) : registrationPath ? (
      <PublicRegistration registrationToken={registrationPath[1]} />
    ) : eventPath ? (
      <PublicEvent eventId={eventPath[1]} />
    ) : groupsPath ? (
      <PublicGroups churchId={groupsPath[1]} />
    ) : catalogPath ? (
      <PublicCatalog churchId={catalogPath[1]} />
    ) : mediaPath ? (
      <PublicMedia token={mediaPath[1]} />
    ) : window.location.pathname === "/" ? (
      <LandingPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );

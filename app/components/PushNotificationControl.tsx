"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseClient } from "../supabase-client";

type PushStatus = "checking" | "unsupported" | "disabled" | "enabled" | "denied" | "missing-config" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function currentToken() {
  const supabase = getSupabaseClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  return data.session?.access_token ?? "";
}

async function notificationSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  return true;
}

export function PushNotificationControl() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [message, setMessage] = useState("Conferindo notificacoes...");

  const refreshStatus = useCallback(async () => {
    if (!(await notificationSupport())) {
      setStatus("unsupported");
      setMessage("Este aparelho nao permite notificacoes em segundo plano. Voce ainda vera os avisos dentro do app.");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      setMessage("Notificacoes bloqueadas no navegador. Libere nas configuracoes do aparelho para receber avisos.");
      return;
    }

    const token = await currentToken();
    if (!token) {
      setStatus("disabled");
      setMessage("Entre no sistema para ativar notificacoes neste aparelho.");
      return;
    }

    const response = await fetch("/api/push/subscriptions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as { configured?: boolean; enabled?: boolean };

    if (!result.configured) {
      setStatus("missing-config");
      setMessage("Notificacoes push ainda precisam das chaves VAPID no servidor.");
      return;
    }

    setStatus(result.enabled ? "enabled" : "disabled");
    setMessage(
      result.enabled
        ? "Notificacoes ativas. Som e vibracao dependem das permissoes e configuracoes do seu aparelho."
        : "Ative para receber avisos importantes no celular ou navegador.",
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshStatus]);

  async function enableNotifications() {
    if (!(await notificationSupport())) {
      setStatus("unsupported");
      setMessage("Este aparelho nao permite notificacoes em segundo plano. Voce ainda vera os avisos dentro do app.");
      return;
    }

    const keyResponse = await fetch("/api/push/public-key");
    const keyResult = (await keyResponse.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string };
    if (!keyResult.configured || !keyResult.publicKey) {
      setStatus("missing-config");
      setMessage("Notificacoes push ainda precisam das chaves VAPID no servidor.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "disabled");
      setMessage("Permissao nao concedida. Voce ainda vera os avisos dentro do app.");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey),
      }));
    const token = await currentToken();

    if (!token) {
      setStatus("error");
      setMessage("Sessao expirada. Entre novamente para ativar notificacoes.");
      return;
    }

    const response = await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Nao foi possivel ativar notificacoes neste aparelho.");
      return;
    }

    setStatus("enabled");
    setMessage("Notificacoes ativas. Som e vibracao dependem das permissoes e configuracoes do seu aparelho.");
  }

  async function sendTestNotification() {
    const token = await currentToken();
    if (!token) return;

    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessage(response.ok ? "Teste enviado. Confira a notificacao do aparelho." : "Nao foi possivel enviar o teste agora.");
  }

  return (
    <div className={`push-control ${status}`}>
      <button disabled={status === "checking" || status === "unsupported" || status === "denied"} onClick={enableNotifications} type="button">
        {status === "enabled" ? "Notificacoes ativas" : "Ativar notificacoes"}
      </button>
      {status === "enabled" && (
        <button className="secondary" onClick={sendTestNotification} type="button">
          Enviar teste
        </button>
      )}
      <small>{message}</small>
    </div>
  );
}

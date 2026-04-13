"use client";

import { useState, useEffect, useCallback } from "react";
import { getClientEnv } from "@/lib/client-env";
import { urlBase64ToUint8Array } from "@agentcenter/utils";
import { API_ROUTES } from "@/lib/api-routes";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      // Check existing subscription
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    const vapidKey = getClientEnv("VAPID_PUBLIC_KEY");
    if (!vapidKey) {
      console.warn("[push] VAPID public key not configured");
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      const res = await fetch(API_ROUTES.userNotifications.subscribe, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }

      const errData = await res.json().catch(() => ({}));
      console.error(
        `[push] Subscribe failed (${res.status}):`,
        errData.error ?? errData.message ?? "unknown error",
        res.status === 403 ? "— notifications may not be included in your license plan" : "",
      );
      return false;
    } catch (err) {
      console.error("[push] Subscribe failed:", err);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;

      await fetch(API_ROUTES.userNotifications.subscribe, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      await subscription.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      console.error("[push] Unsubscribe failed:", err);
    }
  }, []);

  return { isSupported, permission, isSubscribed, subscribe, unsubscribe };
}

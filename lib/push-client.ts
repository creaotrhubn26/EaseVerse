// Web Push subscribe helper. Returns the active subscription's endpoint
// so the caller can show "Notifications on" / "off" state.

import { authedFetch } from "./authed-fetch";
import { getApiUrl } from "./query-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiUrl()}/api/notifications/subscribe`);
    if (!res.ok) return null;
    const json = (await res.json()) as { vapidPublicKey?: string };
    return json.vapidPublicKey ?? null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(token: string | null): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  const vapid = await getVapidPublicKey();
  if (!vapid) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(vapid);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast around stricter Uint8Array<ArrayBufferLike> vs ArrayBuffer-only typing
      applicationServerKey: keyBytes.buffer as ArrayBuffer,
    });
  }
  const serialized = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) return null;
  const res = await authedFetch("/api/notifications/subscribe", token, {
    method: "POST",
    body: JSON.stringify({
      endpoint: serialized.endpoint,
      keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
    }),
  });
  if (!res.ok) return null;
  return sub;
}

export async function unsubscribeFromPush(token: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await authedFetch("/api/notifications/subscribe", token, {
    method: "DELETE",
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

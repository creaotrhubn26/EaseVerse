import webpush from "web-push";
import { deleteSubscription, listSubscriptionsForUsers, type PushSubscriptionRow } from "./push-db.js";

let initialized = false;
function ensureVapid() {
  if (initialized) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@easeverse.app";
  if (!pub || !priv) {
    console.warn("[push] VAPID keys not set — notifications are disabled");
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  initialized = true;
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  badge?: string;
  icon?: string;
};

export async function pushToUsers(args: {
  userIds: string[];
  payload: PushPayload;
}): Promise<{ sent: number; pruned: number }> {
  ensureVapid();
  if (!initialized) return { sent: 0, pruned: 0 };
  const subs = await listSubscriptionsForUsers(args.userIds);
  let sent = 0;
  let pruned = 0;
  await Promise.all(
    subs.map(async (sub: PushSubscriptionRow) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(args.payload),
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint gone — prune so we don't retry forever.
          await deleteSubscription(sub.endpoint);
          pruned++;
        } else {
          console.warn("[push] send failed", sub.endpoint, err);
        }
      }
    }),
  );
  return { sent, pruned };
}

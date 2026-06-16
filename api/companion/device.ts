import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { createPairingToken } from "../_lib/pairing-db.js";
import { createDeviceCode, approveDeviceCode, pollDeviceCode } from "../_lib/device-codes-db.js";

const DEVICE_TOKEN_TTL = 365 * 24 * 3600; // varig device-token (1 år)

// Device-kode-paring for companion.
//  POST {action:'request'}            (åpen)  → {deviceCode, userCode, interval, expiresIn}
//  POST {action:'poll', deviceCode}   (åpen)  → {status, pairToken?}
//  POST {action:'approve', userCode}  (auth)  → binder varig pair-token til koden
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const b = ((typeof req.body === "object" && req.body) || {}) as Record<string, unknown>;
  const action = String(b.action || "");

  try {
    if (action === "request") {
      const { deviceCode, userCode, expiresIn } = await createDeviceCode();
      return res.status(200).json({ deviceCode, userCode, interval: 3, expiresIn });
    }

    if (action === "poll") {
      const deviceCode = String(b.deviceCode || "");
      if (!deviceCode) return res.status(400).json({ error: "deviceCode required" });
      const r = await pollDeviceCode(deviceCode);
      return res.status(200).json(r);
    }

    if (action === "approve") {
      if (!isClerkConfigured()) return res.status(503).json({ error: "Auth is not configured." });
      const userId = await requireAuth(req, res);
      if (!userId) return;
      const userCode = String(b.userCode || "");
      if (!userCode) return res.status(400).json({ error: "userCode required" });
      const pairing = await createPairingToken(userId, DEVICE_TOKEN_TTL);
      const ok = await approveDeviceCode(userCode, pairing.token);
      if (!ok) return res.status(404).json({ error: "Code not found, already used, or expired" });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("[companion/device] error:", error);
    return res.status(500).json({ error: (error as Error).message || "Device pairing failed" });
  }
}

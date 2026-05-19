import crypto from "node:crypto";

const TTL_MS = 15 * 60 * 1000;

type PairingEntry = {
  token: string;
  expiresAt: number;
};

const active = new Map<string, PairingEntry>();

function cleanup(now: number) {
  for (const [token, entry] of active.entries()) {
    if (entry.expiresAt <= now) {
      active.delete(token);
    }
  }
}

export function createPairingToken(): PairingEntry {
  const now = Date.now();
  cleanup(now);
  const token = `pair_${crypto.randomBytes(18).toString("base64url")}`;
  const entry: PairingEntry = { token, expiresAt: now + TTL_MS };
  active.set(token, entry);
  return entry;
}

export function isPairingTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const entry = active.get(token);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    active.delete(token);
    return false;
  }
  return true;
}

export function revokePairingToken(token: string): void {
  active.delete(token);
}

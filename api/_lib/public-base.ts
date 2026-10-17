import { easeVersePublicOrigin } from "./auth-upstream.js";
/** Canonical app origin; never build stored URLs from an untrusted request Host. */
export function getPublicBase(): string {
  return easeVersePublicOrigin();
}

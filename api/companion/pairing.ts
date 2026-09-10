import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({
    error: "Legacy EaseVerse Companion pairing is retired.",
    product: "CreatorHub Pro Tools Companion",
    managedFrom: "CreatorHub Workspace → Sound Room",
  });
}

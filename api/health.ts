import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isClaudeAvailable, isGeminiAvailable } from "./_lib/coaching.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "ok",
    providers: {
      claude: isClaudeAvailable(),
      gemini: isGeminiAvailable(),
    },
    timestamp: new Date().toISOString(),
  });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireExternalKey } from "../../../_lib/collab-store.js";
import { warmUpExercises, voiceSafetyRules } from "../../../../constants/warmup.js";
import { breathingPatterns, energyTechniques, moodOptions, affirmations, visualizations } from "../../../../constants/mindfulness.js";

// Eksponerer EaseVerse sitt oppvarmings- og mindfulness-innhold for søsterapper
// (Audio Showcase i CreatorHub) via collab-API-et. Lese-only, statisk innhold.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireExternalKey(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({
    ok: true,
    source: "easeverse",
    warmups: warmUpExercises,
    voiceSafety: voiceSafetyRules,
    breathing: breathingPatterns,
    techniques: energyTechniques,
    moods: moodOptions,
    affirmations,
    visualizations,
  });
}

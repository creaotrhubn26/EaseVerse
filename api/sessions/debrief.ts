import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { isClerkConfigured, requireAuth } from "../_lib/auth.js";
import { getProjectMembership } from "../_lib/projects-db.js";
import {
  getDebrief,
  getLiveSession,
  listParticipants,
  setDebriefDone,
  setDebriefError,
  setDebriefProcessing,
  type DebriefSection,
} from "../_lib/sessions-db.js";
import {
  listTakesWithAnalysisForLiveSession,
  type TakeAnalysisRow,
  type TakeRow,
} from "../_lib/takes-db.js";

export const config = { maxDuration: 120 };

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;

const debriefTool: Anthropic.Tool = {
  name: "submit_debrief",
  description: "Submit the section-by-section breakdown and overall producer notes for this take.",
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Human-readable name e.g. 'Verse 1'." },
            type: {
              type: "string",
              enum: ["intro", "verse", "pre-chorus", "chorus", "bridge", "outro", "other"],
            },
            startSec: { type: "number" },
            endSec: { type: "number" },
            winnerTakeId: {
              type: ["string", "null"],
              description: "ID of the take you'd keep for this section.",
            },
            runnerUpTakeId: { type: ["string", "null"] },
            notes: {
              type: "string",
              description: "1-3 sentences on why the winner won and any other observations.",
            },
          },
          required: ["label", "type", "startSec", "endSec", "winnerTakeId", "notes"],
        },
      },
      overall: { type: "string", description: "2-4 sentence producer summary for the session." },
    },
    required: ["sections", "overall"],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isClerkConfigured()) {
    return res.status(503).json({ error: "Auth is not configured." });
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sessionId = typeof req.query.id === "string" ? req.query.id : null;
  if (!sessionId) return res.status(400).json({ error: "id required" });
  const session = await getLiveSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const membership = await getProjectMembership(session.projectId, userId);
  if (!membership) return res.status(403).json({ error: "Not a project member" });

  if (req.method === "GET") {
    const debrief = await getDebrief(sessionId);
    return res.status(200).json({ debrief });
  }

  if (!anthropic) {
    return res
      .status(503)
      .json({ error: "Anthropic API is not configured. Set ANTHROPIC_API_KEY." });
  }

  const existing = await getDebrief(sessionId);
  if (existing?.status === "processing") {
    return res.status(409).json({ error: "Debrief already in progress" });
  }

  const takes = await listTakesWithAnalysisForLiveSession(sessionId);
  if (takes.length === 0) {
    return res.status(400).json({ error: "No takes to analyse" });
  }

  await setDebriefProcessing(sessionId);
  void runDebrief({ sessionId, takes, lyrics: takes.find((t) => t.lyricsSnapshot)?.lyricsSnapshot ?? null, bpm: session.bpm, recordingStartsAt: session.recordingStartsAt }).catch(async (err) => {
    console.error("[debrief] failed:", err);
    await setDebriefError({
      sessionId,
      errorMessage: (err as Error).message || "Unknown error",
    });
  });
  return res.status(202).json({ status: "processing" });
}

async function runDebrief(args: {
  sessionId: string;
  takes: Array<TakeRow & { analysis: TakeAnalysisRow | null }>;
  lyrics: string | null;
  bpm: number | null;
  recordingStartsAt: string | null;
}): Promise<void> {
  if (!anthropic) throw new Error("Anthropic not configured");
  const participants = await listParticipants(args.sessionId);
  const nameByUser = new Map(participants.map((p) => [p.userId, p.displayName ?? p.userId.slice(0, 8)]));
  const roleByUser = new Map(participants.map((p) => [p.userId, p.projectRole ?? "member"]));
  const recordingStartsMs = args.recordingStartsAt
    ? new Date(args.recordingStartsAt).getTime()
    : null;

  const takePayload = args.takes.map((t) => {
    const uploadedMs = new Date(t.uploadedAt).getTime();
    const offsetSec =
      recordingStartsMs && t.durationSec
        ? Math.max(0, (uploadedMs - t.durationSec * 1000 - recordingStartsMs) / 1000)
        : 0;
    return {
      takeId: t.id,
      vocalist: nameByUser.get(t.userId) ?? t.userId.slice(0, 8),
      role: roleByUser.get(t.userId) ?? "member",
      offsetSec: Number(offsetSec.toFixed(2)),
      durationSec: t.durationSec,
      analysis: t.analysis
        ? {
            transcript: t.analysis.transcript?.slice(0, 600) ?? null,
            pitchMeanHz: t.analysis.pitchMeanHz,
            pitchStddevCents: t.analysis.pitchStddevCents,
            energyAvgDb: t.analysis.energyAvgDb,
            energyStddevDb: t.analysis.energyStddevDb,
            timingScore: t.analysis.timingScore,
            pronunciationScore: t.analysis.pronunciationScore,
            aiNotes: t.analysis.aiNotes?.slice(0, 400) ?? null,
          }
        : null,
    };
  });

  const userText = [
    `You are an experienced music producer reviewing a live recording session.`,
    `Session BPM: ${args.bpm ?? "unknown"}.`,
    args.lyrics ? `Lyrics:\n${args.lyrics.slice(0, 4000)}` : "Lyrics: (not provided)",
    `Takes captured during this session (offsetSec is when the take starts relative to the session's recording start):`,
    JSON.stringify(takePayload, null, 2),
    `Break the song into musical sections (intro/verse/chorus/bridge/outro). For each section, pick the single take that should win the comp — prefer pitch stability, timing accuracy, pronunciation, and consistent energy. If two takes cover the same section, name one winner and one runner-up. Keep notes terse (1-3 sentences each). Finally write a brief overall producer summary. Always call submit_debrief; do not respond with plain text.`,
  ].join("\n\n");

  const resp = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    tools: [debriefTool],
    tool_choice: { type: "tool", name: "submit_debrief" },
    messages: [{ role: "user", content: userText }],
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_debrief",
  );
  if (!toolUse) throw new Error("Model returned no debrief tool call");
  const input = toolUse.input as {
    sections: DebriefSection[];
    overall: string;
  };

  // Clamp section bounds inside max duration.
  const longest = args.takes.reduce(
    (acc, t) => Math.max(acc, (t.durationSec ?? 0) + getOffsetSec(t, recordingStartsMs)),
    0,
  );
  const cleanedSections: DebriefSection[] = input.sections.map((s) => ({
    label: String(s.label).slice(0, 60),
    type: String(s.type),
    startSec: Math.max(0, Number(s.startSec) || 0),
    endSec: Math.max(0, Math.min(longest || Number(s.endSec) || 0, Number(s.endSec) || 0)),
    winnerTakeId: s.winnerTakeId ?? null,
    runnerUpTakeId: s.runnerUpTakeId ?? null,
    notes: String(s.notes ?? "").slice(0, 800),
  }));

  await setDebriefDone({
    sessionId: args.sessionId,
    sections: cleanedSections,
    overallNotes: String(input.overall ?? "").slice(0, 2000),
  });
}

function getOffsetSec(t: TakeRow, recordingStartsMs: number | null): number {
  if (!recordingStartsMs || !t.durationSec) return 0;
  const uploadedMs = new Date(t.uploadedAt).getTime();
  return Math.max(0, (uploadedMs - t.durationSec * 1000 - recordingStartsMs) / 1000);
}

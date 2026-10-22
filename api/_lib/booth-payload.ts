import { validBpm } from '../../lib/tempo';
import type { Pool } from "pg";
import { listRegionsForTakes } from "./takes-db.js";
import { getProjectReferenceTrack } from "./projects-db.js";
import { fetchCreatorHubReferencePlayback } from "./creatorhub-reference-playback.js";
import { getPublicBase } from "./public-base.js";
import { soundRoomStorage } from "./creatorhub-storage.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const clock = (raw: unknown) => {
  const s = Math.max(0, Math.floor(Number(raw) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export async function buildLinkedBoothPayload(
  p: Pick<Pool, "query">,
  userId: string,
  trackId: string,
  projectId?: string,
  {
    referencePlayback = fetchCreatorHubReferencePlayback,
    storage = soundRoomStorage,
    regions = listRegionsForTakes,
  } = {},
) {
  const { rows: links } = await p.query(
    `SELECT link.* FROM creatorhub_project_links link
       JOIN project_members member ON member.project_id=link.easeverse_project_id AND member.user_id=$1
      WHERE link.external_track_id=$2 AND ($3::text IS NULL OR link.easeverse_project_id=$3)
      LIMIT 2`,
    [userId, trackId, projectId || null],
  );
  // Never infer a project from another user's take or a track title.
  if (links.length > 1) return null;
  let link = links[0];
  let legacy = false;
  if (!link) {
    // Keep existing unlinked takes usable, but only for their owner/members.
    const scopes = await p.query(
      `SELECT DISTINCT t.project_id FROM takes t WHERE t.external_track_id=$1
        AND (t.user_id=$2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=t.project_id AND m.user_id=$2))
        AND ($3::text IS NULL OR t.project_id=$3) LIMIT 2`,
      [trackId, userId, projectId || null],
    );
    if (scopes.rows.length !== 1) return null;
    legacy = true;
    link = {
      easeverse_project_id: scopes.rows[0].project_id,
      owner_user_id: userId,
    };
  }
  if (!legacy && !link.audio_review_project_id) return null;
  const { rows: lyricsRows } = await p.query<{
    external_track_id: string;
    title: string | null;
    lyrics: string | null;
    bpm: number | null;
    updated_at: string;
  }>(
    `SELECT external_track_id, title, lyrics, bpm, updated_at
       FROM collab_lyrics_drafts
       WHERE external_track_id = $1 AND (project_id = ANY($2::text[]) OR $3::boolean)
       ORDER BY updated_at DESC
       LIMIT 1`,
    [
      trackId,
      [
        link.audio_review_project_id,
        link.creatorhub_project_id,
        link.easeverse_project_id,
      ],
      legacy,
    ],
  );

  const { rows: takeRows } = await p.query<{
    id: string;
    filename: string;
    uploaded_at: string;
    duration_sec: number | null;
    status: string;
    storage_url: string;
    producer_note: string | null;
    producer_decision: string | null;
    producer_memo_url: string | null;
    producer_memo_duration_sec: number | null;
    decision_locked_at: string | null;
    lyrics_snapshot: string | null;
    lyrics_snapshot_at: string | null;
    project_id: string | null;
    agree_count: string | number | null;
    disagree_count: string | number | null;
    transcript: string | null;
    ai_notes: string | null;
    pitch_mean_hz: number | null;
    energy_avg_db: number | null;
  }>(
    `SELECT t.id, t.filename, t.uploaded_at, t.duration_sec, t.status, t.storage_url,
              t.producer_note, t.producer_decision,
              t.producer_memo_url, t.producer_memo_duration_sec, t.decision_locked_at,
              t.lyrics_snapshot, t.lyrics_snapshot_at, t.project_id,
              (SELECT COUNT(*) FROM take_consensus_votes v WHERE v.take_id = t.id AND v.vote = 'agree') AS agree_count,
              (SELECT COUNT(*) FROM take_consensus_votes v WHERE v.take_id = t.id AND v.vote = 'disagree') AS disagree_count,
              a.transcript, a.ai_notes, a.pitch_mean_hz, a.energy_avg_db
       FROM takes t
       LEFT JOIN take_analyses a ON a.take_id = t.id
       WHERE t.external_track_id = $1 AND (t.project_id = $2 OR (t.project_id IS NULL AND $2::text IS NULL AND t.user_id=$3))
       ORDER BY t.uploaded_at DESC
       LIMIT 20`,
    [trackId, link.easeverse_project_id, userId],
  );

  const lyrics = lyricsRows[0]
    ? {
        title: lyricsRows[0].title,
        lyrics: lyricsRows[0].lyrics,
        bpm: lyricsRows[0].bpm,
        updatedAt: lyricsRows[0].updated_at,
      }
    : null;

  const regionMap = await regions(takeRows.map((t) => t.id));

  // Resolve the linked room directly: no first take is required.
  const playback = legacy
    ? { reference: undefined }
    : await referencePlayback({
        ownerUserId: link.owner_user_id,
        audioReviewProjectId: link.audio_review_project_id,
      });
  const legacyReference =
    legacy && link.easeverse_project_id
      ? await getProjectReferenceTrack(link.easeverse_project_id)
      : null;
  const referenceTrack = playback.reference
    ? {
        url: playback.reference.url,
        name: playback.reference.fileName,
        durationSec: playback.reference.durationSec,
        versionId: playback.reference.versionId,
        expiresAt: Date.now() + playback.reference.expiresInSeconds * 1000,
      }
    : legacyReference
      ? {
          url: legacyReference.url,
          name: legacyReference.name,
          durationSec: legacyReference.durationSec,
          versionId: undefined,
          expiresAt: undefined,
        }
      : null;
  const context = {
    ownerUserId: link.owner_user_id,
    actorUserId: userId,
    audioReviewProjectId: link.audio_review_project_id,
    externalTrackId: trackId,
  };
  const review =
    !legacy && (referenceTrack || takeRows.some((t) => UUID.test(t.id)))
      ? await storage("reviews", context, referenceTrack?.versionId ? { referenceVersionId: referenceTrack.versionId } : {})
      : { comments: [] };
  const collaboration: Record<string, any> = !legacy ? await storage('collaboration',context).catch(()=>({requests:[],takeContexts:[],unavailable:true})) : { requests: [],takeContexts:[] };
  const takeContext = new Map((Array.isArray(collaboration.takeContexts)?collaboration.takeContexts:[]).map((r:any)=>[r.id,r.context]));
  const comments = Array.isArray(review.comments) ? review.comments : [];
  const linked = takeRows.map((t) => {
    if (legacy || !UUID.test(t.id))
      return { take: t, audioUrl: t.storage_url, extraRegions: [] as any[] };
    const takeComments = comments.filter(
      (c: any) => c.storage_object_id === t.id,
    );
    const notes = takeComments
      .map((c: any) => `@${clock(c.timecode_seconds)} ${String(c.body || "")}`)
      .join("\n");
    const extraRegions = takeComments
      .filter(
        (c: any) => Number(c.end_time_seconds) > Number(c.timecode_seconds),
      )
      .map((c: any) => ({
        id: `sound-room-${c.id}`,
        startSec: Number(c.timecode_seconds),
        endSec: Number(c.end_time_seconds),
        label: String(c.body || ""),
        color: null,
        autoLoop: false,
      }));
    return {
      take: {
        ...t,
        producer_note:
          [t.producer_note, notes].filter(Boolean).join("\n") || null,
      },
      audioUrl: `${getPublicBase()}/api/takes/${t.id}/audio`,
      extraRegions,
    };
  });

  return {
    trackId: trackId,
    lyrics,
    // A linked room follows the producer's current tempo, never a local draft.
    tempo: legacy
      ? { source: 'lyrics' as const, bpm: validBpm(lyrics?.bpm) }
      : { source: 'sound-room' as const, bpm: validBpm(collaboration.tempo?.bpm),
          unavailable: collaboration.unavailable === true || !collaboration.tempo,
          updatedAt: collaboration.tempo?.updatedAt },
    referenceTrack: referenceTrack ? {
      ...referenceTrack,
      producerComments: comments.filter((comment: any) => referenceTrack.versionId && comment.version_id === referenceTrack.versionId).map((comment: any) => ({
        id: String(comment.id), body: String(comment.body || ''),
        seconds: Math.max(0, Number(comment.timecode_seconds) || 0),
        endSeconds: comment.end_time_seconds == null ? null : Math.max(0, Number(comment.end_time_seconds) || 0),
        author: String(comment.author || 'Producer'), status: String(comment.status || 'unresolved'),
      })),
    } : null,
    collaborationUnavailable: collaboration.unavailable === true,
    recordingRequests: collaboration.requests || [],
    projectId: link.easeverse_project_id,
    takes: linked.map(({ take: t, audioUrl, extraRegions }) => ({
      id: t.id,
      recordingContext: takeContext.get(t.id) || null,
      filename: t.filename,
      uploadedAt: t.uploaded_at,
      durationSec: t.duration_sec,
      status: t.status,
      audioUrl,
      producerNote: t.producer_note,
      producerDecision:
        t.producer_decision === "keeper" || t.producer_decision === "redo"
          ? t.producer_decision
          : null,
      producerMemoUrl: t.producer_memo_url,
      producerMemoDurationSec: t.producer_memo_duration_sec,
      decisionLockedAt: t.decision_locked_at,
      consensus: {
        agree: Number(t.agree_count ?? 0),
        disagree: Number(t.disagree_count ?? 0),
      },
      regions: [...(regionMap.get(t.id) ?? []), ...extraRegions].map((r) => ({
        id: r.id,
        startSec: r.startSec,
        endSec: r.endSec,
        label: r.label,
        color: r.color,
        autoLoop: r.autoLoop,
      })),
      lyricsSnapshot: t.lyrics_snapshot,
      lyricsSnapshotAt: t.lyrics_snapshot_at,
      transcript: t.transcript,
      aiNotes: t.ai_notes,
      pitchMeanHz: t.pitch_mean_hz,
      energyAvgDb: t.energy_avg_db,
    })),
  };
}

# EaseVerse Pro Tools Companion (Phase 1)

This companion process bridges Pro Tools session exports into EaseVerse `/api/v1/collab/protools`.

## What it does

- Polls a local JSON export file (from your Pro Tools-side workflow).
- Detects file changes.
- Upserts markers, take scores, and pronunciation feedback to EaseVerse.
- Can parse real Pro Tools `Export Session Info as Text...` files and sync tempo + markers directly.
- Optionally pulls latest EaseVerse Pro Tools + lyrics payloads into a local JSON snapshot for Pro Tools-side ingestion.

## Run

From project root:

```bash
npm run companion:dev
```

## Environment Variables

- `EASEVERSE_API_BASE_URL` (default: `http://127.0.0.1:5000`)
- `EASEVERSE_API_KEY` (optional; required if API key enforcement is on)
- `PROTOOLS_PROJECT_ID` (optional; used when payload omits `projectId`)
- `PROTOOLS_SOURCE` (default: `protools-companion`)
- `PROTOOLS_POLL_MS` (default: `2000`)
- `PROTOOLS_EXPORT_FILE` (path to JSON file to watch)
- `PROTOOLS_SESSION_INFO_FILE` (path to real Pro Tools Session Info text export file)
- `PROTOOLS_TRACK_ID` (optional; overrides inferred `externalTrackId`)
- `PROTOOLS_IMPORT_FILE` (path to write pulled snapshot JSON)
- `PROTOOLS_PULL_ENABLED` (`true` to enable pull mode; auto-enabled if `PROTOOLS_IMPORT_FILE` is set)
- `PROTOOLS_PULL_TRACK_ID` (optional; only pull one `externalTrackId`)
- `PROTOOLS_VERBOSE` (`true`/`false`)

If `PROTOOLS_SESSION_INFO_FILE` is set, the companion uses real Session Info parsing mode.

## Example payload file

`/tmp/protools-sync.json`

```json
{
  "externalTrackId": "pt-track-001",
  "bpm": 120,
  "markers": [
    { "id": "m1", "label": "Verse 1", "positionMs": 12000, "sectionType": "verse" }
  ],
  "takeScores": [
    {
      "id": "take-01",
      "takeName": "Lead Vox Comp",
      "textAccuracy": 88,
      "pronunciationClarity": 84,
      "timingConsistency": "medium",
      "overallScore": 86
    }
  ],
  "pronunciationFeedback": [
    {
      "id": "pf-1",
      "word": "beautiful",
      "tip": "Keep the t crisp, then lighten the l",
      "severity": "medium",
      "positionMs": 17500,
      "takeId": "take-01"
    }
  ]
}
```

Set env and run:

```bash
export PROTOOLS_EXPORT_FILE=/tmp/protools-sync.json
export EASEVERSE_API_BASE_URL=http://127.0.0.1:5000
npm run companion:dev
```

## Pull mode example

```bash
export EASEVERSE_API_BASE_URL=http://127.0.0.1:5000
export PROTOOLS_IMPORT_FILE=/tmp/protools-ingest.json
export PROTOOLS_PULL_ENABLED=true
export PROTOOLS_PULL_TRACK_ID=pt-track-001
npm run companion:dev
```

Pulled output shape:

```json
{
  "pulledAt": "2026-02-17T00:00:00.000Z",
  "protools": [
    {
      "externalTrackId": "pt-track-001",
      "source": "protools-companion",
      "markers": [],
      "takeScores": [],
      "pronunciationFeedback": [],
      "updatedAt": "2026-02-17T00:00:00.000Z",
      "receivedAt": "2026-02-17T00:00:00.000Z"
    }
  ],
  "lyrics": [
    {
      "externalTrackId": "pt-track-001",
      "title": "Song",
      "lyrics": "..."
    }
  ]
}
```

## Real Pro Tools mode (no simulation)

1. In Pro Tools, run `File -> Export -> Session Info as Text...`.
2. Save to a known path (example: `/tmp/pt-session-info.txt`).
3. Configure the companion:

```bash
export EASEVERSE_API_BASE_URL=http://127.0.0.1:5000
export EASEVERSE_API_KEY=YOUR_EXTERNAL_API_KEY
export PROTOOLS_SESSION_INFO_FILE=/tmp/pt-session-info.txt
export PROTOOLS_PROJECT_ID=album-a
export PROTOOLS_SOURCE=protools-companion
# optional override if you want a fixed externalTrackId
export PROTOOLS_TRACK_ID=pt-track-001
npm run companion:dev
```

When the exported text file changes, companion parses:

- session name (used to infer track id if `PROTOOLS_TRACK_ID` is not set)
- BPM values (`NN bpm` patterns)
- marker rows/timecode patterns

and pushes them to `/api/v1/collab/protools`.

### Validate parsing against a real export file

Run this to inspect exactly what the parser extracts from your exported Session Info text:

```bash
npm run companion:parse -- /tmp/pt-session-info.txt
```

Optional fixed track id:

```bash
npm run companion:parse -- /tmp/pt-session-info.txt pt-track-001
```

## No Pro Tools installed yet? Run the built-in real-format demo

A starter Session Info text file is included at:

- `companion/examples/protools-session-info.txt`

Commands:

```bash
npm run companion:sample:parse
```

```bash
npm run companion:sample:push
```

Or run both in one command:

```bash
npm run companion:demo
```

`companion:sample:push` reads `.env` for API values, so your existing `EASEVERSE_API_BASE_URL` and API key settings are used automatically.

## One-command healthcheck

This runs a deterministic local verification flow:

- seeds Session Info text input,
- runs companion briefly,
- verifies push to `/api/v1/collab/protools`,
- verifies pulled snapshot output.

```bash
npm run companion:healthcheck
```

CI-friendly (faster + quieter):

```bash
npm run companion:healthcheck:ci
```

## Database migration (recommended)

Pro Tools sync data now supports durable Postgres persistence. Apply schema changes with:

```bash
npm run db:push
```

The initial migration SQL is in:

- `migrations/0001_collab_protools_sync.sql`

## Notes

- This is a bridge scaffold (no direct Pro Tools SDK binding yet).
- It is designed so a PT-side script/export step can feed JSON into this process.

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CI_MODE=false
if [[ "${1:-}" == "--ci" || "${COMPANION_HEALTHCHECK_CI:-}" == "true" ]]; then
  CI_MODE=true
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

API_KEY="${EASEVERSE_API_KEY:-${EXTERNAL_API_KEY:-}}"
CONFIGURED_BASE="${EASEVERSE_API_BASE_URL:-}"
SESSION_FILE="${PROTOOLS_SESSION_INFO_FILE:-/tmp/pt-session-info.txt}"
IMPORT_FILE="${PROTOOLS_IMPORT_FILE:-/tmp/protools-ingest.json}"
TRACK_ID="${PROTOOLS_TRACK_ID:-pt-track-001}"

PORT_CANDIDATES=("$CONFIGURED_BASE" "http://127.0.0.1:5059" "http://127.0.0.1:5061" "http://127.0.0.1:5071" "http://127.0.0.1:5000")

API_BASE_URL=""
for candidate in "${PORT_CANDIDATES[@]}"; do
  if [[ -z "$candidate" ]]; then
    continue
  fi
  candidate="${candidate%/}"

  headers_file="$(mktemp)"
  body_file="$(mktemp)"
  http_code="$(curl -s -o "$body_file" -D "$headers_file" -w "%{http_code}" ${API_KEY:+-H "x-api-key: $API_KEY"} "$candidate/api/v1/collab/protools" || true)"
  content_type="$(grep -i '^content-type:' "$headers_file" | tail -n1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r')"
  rm -f "$headers_file" "$body_file"

  if [[ "$http_code" == "200" || "$http_code" == "401" ]] && [[ "$content_type" == application/json* ]]; then
    API_BASE_URL="$candidate"
    break
  fi
done

if [[ -z "$API_BASE_URL" ]]; then
  echo "[healthcheck] no compatible API endpoint found on known local ports"
  exit 1
fi

mkdir -p "$(dirname "$SESSION_FILE")"
cp companion/examples/protools-session-info.txt "$SESSION_FILE"

TARGET_BPM=$((120 + (RANDOM % 7) + 1))
sed -i '' -E "s/[0-9]+\.[0-9]+ BPM/${TARGET_BPM}.00 BPM/" "$SESSION_FILE"

COMPANION_LOG="/tmp/easeverse-companion-healthcheck.log"
rm -f "$COMPANION_LOG"

echo "[healthcheck] using API base: $API_BASE_URL"
echo "[healthcheck] target bpm: $TARGET_BPM"
if [[ "$CI_MODE" == "true" ]]; then
  echo "[healthcheck] mode: ci"
fi

set +e
EASEVERSE_API_BASE_URL="$API_BASE_URL" \
PROTOOLS_SESSION_INFO_FILE="$SESSION_FILE" \
PROTOOLS_IMPORT_FILE="$IMPORT_FILE" \
PROTOOLS_PULL_ENABLED=true \
PROTOOLS_VERBOSE=false \
npm run companion:dev >"$COMPANION_LOG" 2>&1 &
COMPANION_PID=$!
set -e

cleanup() {
  if kill -0 "$COMPANION_PID" >/dev/null 2>&1; then
    kill "$COMPANION_PID" >/dev/null 2>&1 || true
    wait "$COMPANION_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

SYNCED=0
MAX_WAIT_SECONDS=15
if [[ "$CI_MODE" == "true" ]]; then
  MAX_WAIT_SECONDS=10
fi

for ((i=1; i<=MAX_WAIT_SECONDS; i++)); do
  if grep -q "\[companion\] synced track" "$COMPANION_LOG" 2>/dev/null; then
    SYNCED=1
    break
  fi
  sleep 1
done

if [[ "$SYNCED" != "1" ]]; then
  echo "[healthcheck] companion did not report synced track"
  tail -n 80 "$COMPANION_LOG" || true
  exit 1
fi

REMOTE_BPM=""
REMOTE_BASE_MATCH=""
for candidate in "${PORT_CANDIDATES[@]}"; do
  if [[ -z "$candidate" ]]; then
    continue
  fi
  candidate="${candidate%/}"
  candidate_bpm="$(curl -s ${API_KEY:+-H "x-api-key: $API_KEY"} "$candidate/api/v1/collab/protools/$TRACK_ID" | jq -r '.item.bpm // empty' 2>/dev/null || true)"
  if [[ "$candidate_bpm" == "$TARGET_BPM" ]]; then
    REMOTE_BPM="$candidate_bpm"
    REMOTE_BASE_MATCH="$candidate"
    break
  fi
done

LOCAL_BPM="$(jq -r '.protools[0].bpm // empty' "$IMPORT_FILE" 2>/dev/null || true)"

if [[ "$REMOTE_BPM" != "$TARGET_BPM" ]]; then
  echo "[healthcheck] API bpm mismatch across candidates (expected $TARGET_BPM, got ${REMOTE_BPM:-<empty>})"
  exit 1
fi

if [[ "$LOCAL_BPM" != "$TARGET_BPM" ]]; then
  echo "[healthcheck] snapshot bpm mismatch (expected $TARGET_BPM, got ${LOCAL_BPM:-<empty>})"
  exit 1
fi

echo "[healthcheck] ok"
echo "[healthcheck] apiBaseUrl=$API_BASE_URL resolvedWriteBase=${REMOTE_BASE_MATCH:-unknown} trackId=$TRACK_ID bpm=$TARGET_BPM"

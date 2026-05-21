#!/usr/bin/env bash
# Upload Companion artifacts (Mac DMG, Windows MSI, Linux AppImage/DEB) to
# Vercel Blob and set the matching COMPANION_DOWNLOAD_* env vars on the
# Vercel project so /api/companion/downloads serves them.
#
# Usage:
#   scripts/upload-companion-artifacts.sh ~/Downloads/easeverse-companion-runs
#
# The directory should contain the four GitHub Actions artifact folders:
#   easeverse-companion-macos-arm64/   *.dmg
#   easeverse-companion-macos-x64/     *.dmg
#   easeverse-companion-windows-x64/   *.msi
#   easeverse-companion-linux-x64/     *.AppImage and/or *.deb

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <artifacts-dir>"
  exit 1
fi

ARTIFACTS_DIR="$1"
cd "$(dirname "$0")/.."

upload_one() {
  local local_path="$1"
  local pathname="$2"
  if [[ ! -f "$local_path" ]]; then
    echo "  ⚠ missing $local_path — skipping"
    return 1
  fi
  echo "▶ Uploading $local_path"
  vercel blob put "$local_path" --pathname "$pathname" --access public --force | tee /tmp/__blob_url.txt
}

set_env() {
  local key="$1"
  local value="$2"
  echo "▶ Setting $key in Vercel production"
  printf '%s' "$value" | vercel env add "$key" production --force >/dev/null
}

MAC_DMG=$(find "$ARTIFACTS_DIR" -path '*macos-x64*' -name '*.dmg' | head -1 || true)
MAC_ARM=$(find "$ARTIFACTS_DIR" -path '*macos-arm64*' -name '*.dmg' | head -1 || true)
WIN_MSI=$(find "$ARTIFACTS_DIR" -path '*windows-x64*' -name '*.msi' | head -1 || true)
LINUX_APPIMAGE=$(find "$ARTIFACTS_DIR" -path '*linux-x64*' -name '*.AppImage' | head -1 || true)

if [[ -n "$MAC_DMG" ]]; then
  upload_one "$MAC_DMG" "downloads/easeverse-companion-0.1.0-mac-x64.dmg"
fi
if [[ -n "$MAC_ARM" ]]; then
  upload_one "$MAC_ARM" "downloads/easeverse-companion-0.1.0-mac-arm64.dmg"
  ARM_URL=$(grep -oE 'https://[^ ]*' /tmp/__blob_url.txt | tail -1)
  set_env "COMPANION_DOWNLOAD_MAC_ARM_DMG" "$ARM_URL"
fi
if [[ -n "$WIN_MSI" ]]; then
  upload_one "$WIN_MSI" "downloads/easeverse-companion-0.1.0-win-x64.msi"
  WIN_URL=$(grep -oE 'https://[^ ]*' /tmp/__blob_url.txt | tail -1)
  set_env "COMPANION_DOWNLOAD_WIN_MSI" "$WIN_URL"
fi
if [[ -n "$LINUX_APPIMAGE" ]]; then
  upload_one "$LINUX_APPIMAGE" "downloads/easeverse-companion-0.1.0-linux-x86_64.AppImage"
  LINUX_URL=$(grep -oE 'https://[^ ]*' /tmp/__blob_url.txt | tail -1)
  set_env "COMPANION_DOWNLOAD_LINUX" "$LINUX_URL"
fi

echo ""
echo "▶ Redeploying so the new env vars apply"
vercel --prod --yes --archive=tgz

echo ""
echo "✓ Done. Check https://easeverse.vercel.app/companion to verify."

#!/usr/bin/env bash
# Publish a Companion desktop release. Pushes the GitHub Actions workflow
# (if not already on remote) and tags a new version, which triggers a matrix
# build for macOS arm64 + x64, Windows x64, and Linux x64 installers.
#
# Usage:
#   scripts/release-companion.sh                 # tags companion-v0.1.0 (default)
#   scripts/release-companion.sh 0.1.1           # tags companion-v0.1.1
#
# After CI finishes (~6-10 min), download the artifacts from
# https://github.com/creaotrhubn26/EaseVerse/actions and run
#   scripts/upload-companion-artifacts.sh <path-to-artifacts-dir>
# to publish them through /api/companion/downloads.

set -euo pipefail

VERSION="${1:-0.1.0}"
TAG="companion-v${VERSION}"

cd "$(dirname "$0")/.."

# Ensure clean tree on main
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✘ Working tree has uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi

# Push the workflow file if it's not already on remote
WF=".github/workflows/companion-desktop.yml"
if [[ -f "$WF" ]] && git diff --quiet HEAD -- "$WF" && ! git ls-tree -r origin/main --name-only | grep -q "^$WF\$" 2>/dev/null; then
  echo "▶ Pushing CI workflow to main"
  git add "$WF"
  git commit -m "CI: build companion desktop installers"
  git push origin main
fi

# Tag and push
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✘ Tag $TAG already exists. Bump the version arg."
  exit 1
fi

echo "▶ Tagging $TAG and pushing"
git tag "$TAG"
git push origin "$TAG"

echo ""
echo "✓ Tag pushed. Watch the matrix build at:"
echo "  https://github.com/creaotrhubn26/EaseVerse/actions/workflows/companion-desktop.yml"
echo ""
echo "When the run is green, download the artifacts and run:"
echo "  scripts/upload-companion-artifacts.sh <path-to-artifacts-dir>"

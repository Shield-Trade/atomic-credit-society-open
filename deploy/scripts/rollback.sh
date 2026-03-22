#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

CURRENT_FILE="deploy/state/current_version"
PREVIOUS_FILE="deploy/state/previous_version"
HISTORY_FILE="deploy/logs/deploy-history.log"
SKIP_VERIFY="${ROLLBACK_SKIP_VERIFY:-0}"

if [[ -n "${1:-}" ]]; then
  ROLLBACK_VERSION="$1"
else
  if [[ ! -f "$PREVIOUS_FILE" ]]; then
    echo "[rollback] No previous deployment version found."
    exit 1
  fi
  ROLLBACK_VERSION="$(cat "$PREVIOUS_FILE")"
fi

if [[ -z "$ROLLBACK_VERSION" ]]; then
  echo "[rollback] Rollback target version is empty; cannot rollback."
  exit 1
fi

CURRENT_VERSION=""
if [[ -f "$CURRENT_FILE" ]]; then
  CURRENT_VERSION="$(cat "$CURRENT_FILE")"
fi

for service in backend frontend; do
  if ! docker image inspect "atomic-credit-${service}:${ROLLBACK_VERSION}" >/dev/null 2>&1; then
    echo "[rollback] Missing image atomic-credit-${service}:${ROLLBACK_VERSION}. Cannot rollback safely."
    exit 1
  fi
done

echo "[rollback] Rolling back from ${CURRENT_VERSION:-unknown} to ${ROLLBACK_VERSION}..."
APP_VERSION="$ROLLBACK_VERSION" docker compose up -d --no-build

echo "$ROLLBACK_VERSION" > "$CURRENT_FILE"
echo "$CURRENT_VERSION" > "$PREVIOUS_FILE"

mkdir -p deploy/logs
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") rollback from=${CURRENT_VERSION:-unknown} to=${ROLLBACK_VERSION}" >> "$HISTORY_FILE"

if [[ "$SKIP_VERIFY" == "1" ]]; then
  echo "[rollback] Verification skipped (ROLLBACK_SKIP_VERIFY=1)."
else
  echo "[rollback] Running verification after rollback..."
  bash deploy/scripts/verify.sh
fi

echo "[rollback] Rollback completed to version ${ROLLBACK_VERSION}."

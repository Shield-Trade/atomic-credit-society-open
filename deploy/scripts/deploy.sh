#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p deploy/state deploy/logs

if [[ -n "${1:-}" ]]; then
  VERSION="$1"
else
  if command -v node >/dev/null 2>&1; then
    VERSION="$(node -p "require('./package.json').version")"
  else
    VERSION="$(grep -m1 '"version"' package.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  fi
fi
CURRENT_FILE="deploy/state/current_version"
PREVIOUS_FILE="deploy/state/previous_version"
HISTORY_FILE="deploy/logs/deploy-history.log"
ROLLBACK_READY_FILE="deploy/state/rollback_ready"

PREVIOUS_VERSION=""
if [[ -f "$CURRENT_FILE" ]]; then
  PREVIOUS_VERSION="$(cat "$CURRENT_FILE")"
fi

TARGET_VERSION="$VERSION"
DEPLOY_SUCCESS=0

auto_rollback() {
  local reason="$1"
  echo "[deploy] ERROR: ${reason}"

  if [[ -z "$PREVIOUS_VERSION" ]]; then
    echo "[deploy] No previous version recorded; cannot auto-rollback."
    return 0
  fi

  echo "[deploy] Attempting auto-rollback to ${PREVIOUS_VERSION}..."
  if ROLLBACK_SKIP_VERIFY=0 bash deploy/scripts/rollback.sh "$PREVIOUS_VERSION"; then
    echo "[deploy] Auto-rollback completed."
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") auto_rollback from=${TARGET_VERSION} to=${PREVIOUS_VERSION} reason=$(echo "$reason" | tr ' ' '_')" >> "$HISTORY_FILE"
  else
    echo "[deploy] Auto-rollback failed. Manual intervention is required."
  fi
}

on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "$DEPLOY_SUCCESS" -ne 1 ]]; then
    auto_rollback "deployment_failed_exit_code_${exit_code}"
  fi
  exit "$exit_code"
}

trap on_error ERR

if [[ -n "$PREVIOUS_VERSION" ]]; then
  for service in backend frontend; do
    if ! docker image inspect "atomic-credit-${service}:${PREVIOUS_VERSION}" >/dev/null 2>&1; then
      echo "[deploy] WARNING: rollback image missing atomic-credit-${service}:${PREVIOUS_VERSION}"
    fi
  done
  echo "$PREVIOUS_VERSION" > "$ROLLBACK_READY_FILE"
else
  echo "" > "$ROLLBACK_READY_FILE"
fi

echo "[deploy] Validating docker compose configuration..."
docker compose config -q

echo "[deploy] Building services for version ${VERSION}..."
APP_VERSION="$VERSION" docker compose build backend frontend

echo "[deploy] Starting services for version ${VERSION}..."
APP_VERSION="$VERSION" docker compose up -d

echo "[deploy] Running post-deploy verification..."
bash deploy/scripts/verify.sh

echo "$PREVIOUS_VERSION" > "$PREVIOUS_FILE"
echo "$VERSION" > "$CURRENT_FILE"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") version=${VERSION} previous=${PREVIOUS_VERSION:-none}" >> "$HISTORY_FILE"
DEPLOY_SUCCESS=1

echo "[deploy] Deployment complete: version ${VERSION}"

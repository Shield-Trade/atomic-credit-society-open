#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKEND_URL="${VERIFY_BACKEND_URL:-http://localhost:4000/health}"
FRONTEND_URL="${VERIFY_FRONTEND_URL:-http://localhost:3000}"

BACKEND_ATTEMPTS="${VERIFY_BACKEND_ATTEMPTS:-8}"
FRONTEND_ATTEMPTS="${VERIFY_FRONTEND_ATTEMPTS:-8}"
INITIAL_BACKOFF_SECONDS="${VERIFY_INITIAL_BACKOFF_SECONDS:-1}"
MAX_BACKOFF_SECONDS="${VERIFY_MAX_BACKOFF_SECONDS:-8}"

retry_with_backoff() {
  local label="$1"
  local url="$2"
  local output_file="$3"
  local attempts="$4"

  local attempt=1
  local delay="$INITIAL_BACKOFF_SECONDS"

  while [[ "$attempt" -le "$attempts" ]]; do
    if curl -fsS "$url" >"$output_file"; then
      echo "[verify] ${label} check passed on attempt ${attempt}/${attempts}"
      return 0
    fi

    if [[ "$attempt" -eq "$attempts" ]]; then
      echo "[verify] ${label} check failed after ${attempts} attempts."
      return 1
    fi

    echo "[verify] ${label} check failed on attempt ${attempt}/${attempts}, retrying in ${delay}s..."
    sleep "$delay"

    delay=$((delay * 2))
    if [[ "$delay" -gt "$MAX_BACKOFF_SECONDS" ]]; then
      delay="$MAX_BACKOFF_SECONDS"
    fi
    attempt=$((attempt + 1))
  done
}

show_failure_debug() {
  echo "[verify] --- debug: docker compose ps ---"
  docker compose ps || true
  echo "[verify] --- debug: backend logs (tail 80) ---"
  docker compose logs --tail=80 backend || true
  echo "[verify] --- debug: frontend logs (tail 80) ---"
  docker compose logs --tail=80 frontend || true
}

echo "[verify] Checking container status..."
docker compose ps

echo "[verify] Checking backend health endpoint..."
if ! retry_with_backoff "backend health" "$BACKEND_URL" "/tmp/atomic_credit_backend_health.json" "$BACKEND_ATTEMPTS"; then
  show_failure_debug
  exit 1
fi

echo "[verify] Checking frontend root endpoint..."
if ! retry_with_backoff "frontend root" "$FRONTEND_URL" "/tmp/atomic_credit_frontend_health.html" "$FRONTEND_ATTEMPTS"; then
  show_failure_debug
  exit 1
fi

echo "[verify] OK"

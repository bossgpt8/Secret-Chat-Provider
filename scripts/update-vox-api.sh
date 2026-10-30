#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${VOX_SYSTEMD_SERVICE:-vox-api}"
HEALTH_URL="${VOX_HEALTH_URL:-http://127.0.0.1:8081/api/healthz}"
HEALTH_ATTEMPTS="${VOX_HEALTH_ATTEMPTS:-15}"
HEALTH_DELAY_SECONDS="${VOX_HEALTH_DELAY_SECONDS:-2}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
cd "$REPO_DIR"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

show_service_logs() {
  sudo systemctl status "$SERVICE_NAME" --no-pager || true
  sudo journalctl -u "$SERVICE_NAME" -n 60 --no-pager || true
}

for command_name in git pnpm curl sudo; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done

branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "Expected branch 'main', found '$branch'. Switch to main and rerun."

if [[ -n "$(git status --porcelain)" ]]; then
  fail "The repository has local changes. Commit or safely move them before updating; nothing was changed."
fi

printf 'Fetching latest main from GitHub...\n'
git fetch origin main

if ! git merge-base --is-ancestor HEAD FETCH_HEAD; then
  if git merge-base --is-ancestor FETCH_HEAD HEAD; then
    fail "This checkout has local commits not on GitHub main. Push or review them before updating."
  fi
  fail "Local main and GitHub main have diverged. Resolve the branch state manually; no reset was performed."
fi

git merge --ff-only FETCH_HEAD
printf 'Updated checkout to %s\n' "$(git rev-parse --short HEAD)"

printf 'Installing API workspace dependencies...\n'
pnpm install \
  --filter @workspace/api-server \
  --filter @workspace/db \
  --filter @workspace/api-zod \
  --frozen-lockfile

printf 'Building the API...\n'
pnpm --filter @workspace/api-server run build

printf 'Restarting %s...\n' "$SERVICE_NAME"
if ! sudo systemctl restart "$SERVICE_NAME"; then
  printf 'Service restart failed. Current service status and recent logs:\n' >&2
  show_service_logs
  exit 1
fi

if ! sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  printf 'Service is not active after restart. Current service status and recent logs:\n' >&2
  show_service_logs
  exit 1
fi

printf 'Checking API health at %s...\n' "$HEALTH_URL"
for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
  response="$(curl --fail --silent --max-time 4 "$HEALTH_URL" 2>/dev/null || true)"
  if grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$response"; then
    printf 'Vox API updated and healthy: %s\n' "$response"
    exit 0
  fi
  sleep "$HEALTH_DELAY_SECONDS"
done

printf 'Health check failed after %s attempts. Current service status and recent logs:\n' "$HEALTH_ATTEMPTS" >&2
show_service_logs
exit 1

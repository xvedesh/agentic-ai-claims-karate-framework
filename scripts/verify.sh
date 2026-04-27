#!/usr/bin/env bash
# End-to-end verification: API up (Docker or existing) + full Karate suite (26/26).
#
# Usage:
#   ./scripts/verify.sh              # docker compose up, mvnw test, docker compose down
#   SKIP_DOCKER=1 ./scripts/verify.sh   # assume API already on localhost:3000
#   KEEP_DOCKER=1 ./scripts/verify.sh   # leave stack running after tests

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

health_ok() {
  curl -sf --max-time 3 "http://localhost:3000/health" >/dev/null
}

STARTED_DOCKER=0
if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker not found. Install Docker or run SKIP_DOCKER=1 while the API is running." >&2
    exit 2
  fi
  echo "[verify] docker compose up -d --build"
  docker compose up -d --build
  STARTED_DOCKER=1

  echo "[verify] waiting for http://localhost:3000/health ..."
  deadline=$(($(date +%s) + 180))
  until health_ok; do
    if [[ "$(date +%s)" -gt "$deadline" ]]; then
      echo "error: health check timed out" >&2
      exit 3
    fi
    sleep 1
  done
  echo "[verify] API is healthy."
else
  if ! health_ok; then
    echo "error: SKIP_DOCKER=1 but /health did not respond on localhost:3000" >&2
    exit 4
  fi
fi

MVN="./mvnw"
if [[ -f "./mvnw.cmd" ]] && command -v cmd.exe >/dev/null 2>&1 && [[ "${OSTYPE}" == msys* || "${OSTYPE}" == cygwin* ]]; then
  MVN="./mvnw.cmd"
fi

echo "[verify] ${MVN} test (full Karate default profile)"
"${MVN}" test

if [[ "${STARTED_DOCKER}" == "1" && "${KEEP_DOCKER:-0}" != "1" ]]; then
  echo "[verify] docker compose down"
  docker compose down
fi

echo "[verify] OK — Karate suite finished with exit code 0."

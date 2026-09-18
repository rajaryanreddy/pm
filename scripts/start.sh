#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1; then
  docker compose up --build
else
  echo "Docker is required to run this project."
  exit 1
fi

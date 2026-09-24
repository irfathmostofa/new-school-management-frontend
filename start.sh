#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Start API
cd "$ROOT/apps/api"
PORT=3001 node src/index.js &
API_PID=$!

# Start admin (exposed port)
cd "$ROOT/apps/admin"
npm run dev

trap "kill $API_PID" EXIT

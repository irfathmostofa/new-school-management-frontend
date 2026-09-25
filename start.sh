#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Admin talks to Neon Data API from the browser. No local Express CRUD.
cd "$ROOT/apps/admin"
npm run dev

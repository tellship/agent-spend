#!/usr/bin/env bash
# Read-only: prints the spend report for the project of the caller's directory.
# Usage: spend.sh [agent|task] [N]. Anything the CLI does not accept is passed through, so the CLI prints its usage line.
# No cd (the CLI derives the transcript directory from cwd), no build, no network.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "$ROOT/dist/cli.js" ]; then
  echo "dist/cli.js missing: run npm install && npm run build"
  exit 1
fi
by="${1:-agent}"
[ "$#" -gt 0 ] && shift
top=()
if [ "$#" -gt 0 ]; then
  top=(--top "$1")
  shift
fi
# The ! environment sets COLUMNS=0, which the CLI ignores, so the width is fixed here.
COLUMNS=120 node "$ROOT/dist/cli.js" --by "$by" "${top[@]}" "$@" 2>&1

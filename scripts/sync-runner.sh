#!/bin/bash
# sync-runner.sh — Wrapper for launchd-scheduled sync jobs.
# Usage: sync-runner.sh <job>
#
# Residential jobs (coffee-index, cappuccino, grocery-basket, wine-index,
# ikon-pass, dog-walker) run here because their targets block datacenter IPs.
# They get the blob token from .env.local and nothing else, and never the
# scrape proxy: this machine is the residential egress.
#
# Logs to ~/Library/Logs/marin-monitor/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/Library/Logs/marin-monitor"
mkdir -p "$LOG_DIR"

JOB="${1:-}"
if [[ -z "$JOB" ]]; then
  echo "Usage: sync-runner.sh <job>" >&2
  exit 1
fi

LOGFILE="$LOG_DIR/sync-${JOB}.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Keep log file from growing unbounded — truncate to last 500 lines before appending
if [[ -f "$LOGFILE" ]] && [[ "$(wc -l < "$LOGFILE")" -gt 1000 ]]; then
  tail -500 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
fi

# launchd has no job timeout and never starts a second instance of a label, so
# a hung browser would block every later run. Kill the job after N seconds.
run_with_timeout() {
  local seconds="$1"
  shift
  "$@" &
  local pid=$!
  ( sleep "$seconds" && kill -TERM "$pid" 2>/dev/null && echo "killed after ${seconds}s" >&2 ) &
  local watchdog=$!
  local status=0
  wait "$pid" || status=$?
  kill "$watchdog" 2>/dev/null || true
  return "$status"
}

{
  echo "=== sync:${JOB} started at ${TIMESTAMP} ==="

  export PATH="/opt/homebrew/bin:$PATH"
  cd "$PROJECT_DIR"

  case "$JOB" in
    activity)
      node scripts/extract-activity-feeds.mjs
      ;;
    police)
      node scripts/extract-police-logs.mjs
      ;;
    coffee-index | cappuccino | grocery-basket | wine-index | ikon-pass | dog-walker)
      unset SCRAPE_PROXY_URL SCRAPE_PROXY_SECRET
      BLOB_READ_WRITE_TOKEN="$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' || true)"
      [[ -n "$BLOB_READ_WRITE_TOKEN" ]] || { echo "BLOB_READ_WRITE_TOKEN missing from .env.local" >&2; exit 1; }
      export BLOB_READ_WRITE_TOKEN
      run_with_timeout 1200 node scripts/sync-${JOB}.mjs
      ;;
    *)
      echo "Unknown job: $JOB" >&2
      exit 1
      ;;
  esac

  echo "=== sync:${JOB} finished at $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo ""
} >> "$LOGFILE" 2>&1

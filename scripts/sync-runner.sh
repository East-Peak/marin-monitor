#!/bin/bash
# sync-runner.sh — Wrapper for launchd-scheduled sync jobs.
# Usage: sync-runner.sh <activity|police>
#
# Logs to ~/Library/Logs/marin-monitor/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/Library/Logs/marin-monitor"
mkdir -p "$LOG_DIR"

JOB="${1:-}"
if [[ -z "$JOB" ]]; then
  echo "Usage: sync-runner.sh <activity|police>" >&2
  exit 1
fi

LOGFILE="$LOG_DIR/sync-${JOB}.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Keep log file from growing unbounded — truncate to last 500 lines before appending
if [[ -f "$LOGFILE" ]] && [[ "$(wc -l < "$LOGFILE")" -gt 1000 ]]; then
  tail -500 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
fi

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
    *)
      echo "Unknown job: $JOB" >&2
      exit 1
      ;;
  esac

  echo "=== sync:${JOB} finished at $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo ""
} >> "$LOGFILE" 2>&1

#!/bin/bash
# manage-sync.sh — Install, uninstall, or check status of Marin Monitor sync jobs.
# Usage: manage-sync.sh <install|uninstall|status|logs>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_DIR="$SCRIPT_DIR/launchd"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/marin-monitor"

PLISTS=(
  "com.marin-monitor.sync-activity"
  "com.marin-monitor.sync-police"
)

case "${1:-}" in
  install)
    mkdir -p "$LAUNCH_AGENTS" "$LOG_DIR"
    for name in "${PLISTS[@]}"; do
      src="$PLIST_DIR/${name}.plist"
      dst="$LAUNCH_AGENTS/${name}.plist"
      if [[ ! -f "$src" ]]; then
        echo "ERROR: $src not found" >&2
        exit 1
      fi
      # Unload first if already loaded (ignore errors)
      launchctl bootout "gui/$(id -u)/$name" 2>/dev/null || true
      cp "$src" "$dst"
      launchctl bootstrap "gui/$(id -u)" "$dst"
      echo "Installed and loaded: $name"
    done
    echo ""
    echo "Sync jobs will run every 6 hours. First run happening now (RunAtLoad)."
    echo "Logs: $LOG_DIR/"
    ;;

  uninstall)
    for name in "${PLISTS[@]}"; do
      dst="$LAUNCH_AGENTS/${name}.plist"
      launchctl bootout "gui/$(id -u)/$name" 2>/dev/null || true
      rm -f "$dst"
      echo "Uninstalled: $name"
    done
    ;;

  status)
    for name in "${PLISTS[@]}"; do
      echo "--- $name ---"
      if launchctl print "gui/$(id -u)/$name" 2>/dev/null | head -5; then
        echo "(loaded)"
      else
        echo "(not loaded)"
      fi
      echo ""
    done
    # Show last run timestamps from logs
    if [[ -d "$LOG_DIR" ]]; then
      echo "--- Recent log entries ---"
      for job in activity police; do
        logfile="$LOG_DIR/sync-${job}.log"
        if [[ -f "$logfile" ]]; then
          echo "[$job] $(tail -3 "$logfile" | head -1)"
        else
          echo "[$job] no log file yet"
        fi
      done
    fi
    ;;

  logs)
    job="${2:-activity}"
    logfile="$LOG_DIR/sync-${job}.log"
    if [[ -f "$logfile" ]]; then
      tail -50 "$logfile"
    else
      echo "No log file at $logfile"
    fi
    ;;

  *)
    echo "Usage: manage-sync.sh <install|uninstall|status|logs [activity|police]>"
    exit 1
    ;;
esac

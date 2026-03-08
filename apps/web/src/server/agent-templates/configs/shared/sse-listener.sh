#!/bin/bash
# sse-listener.sh — Background SSE listener for real-time channel messages
#
# Connects to AgentCenter's SSE stream and triggers an immediate agent wake
# when a DM or @mention arrives. Run as a background process via OpenClaw:
#   exec(command: "bash sse-listener.sh", background: true)
#
# OPTIONAL — only use this if you need real-time message responsiveness.
# Most agents are fine with standard heartbeat polling (every 15 min).
#
# Requires MC, KEY, and AGENT_ID environment variables (from IDENTITY.md).
# Creates a PID file at .sse-listener.pid for process management.

set -euo pipefail

PID_FILE=".sse-listener.pid"
RETRY_DELAY=5
MAX_RETRY_DELAY=60
# Debounce: don't wake more than once per 30 seconds
MIN_WAKE_INTERVAL=30
LAST_WAKE=0

cleanup() {
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup EXIT INT TERM

# Guard: don't run if already active
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "SSE listener already running (PID $OLD_PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo $$ > "$PID_FILE"

# Validate required env vars
if [ -z "${MC:-}" ] || [ -z "${KEY:-}" ]; then
  echo "ERROR: MC and KEY environment variables are required."
  echo "Set them from IDENTITY.md before running."
  exit 1
fi

if [ -z "${AGENT_ID:-}" ]; then
  echo "ERROR: AGENT_ID environment variable is required."
  echo "Set it from IDENTITY.md before running."
  exit 1
fi

delay=$RETRY_DELAY

while true; do
  echo "[sse-listener] Connecting to $MC/api/channels/stream ..."

  # Stream SSE events. On each message event, trigger an immediate agent wake.
  # curl -N disables buffering for real-time streaming.
  curl -sN "$MC/api/channels/stream" \
    -H "Authorization: Bearer $KEY" \
    -H "Accept: text/event-stream" 2>/dev/null | while IFS= read -r line; do

    # Parse SSE event type
    if [[ "$line" == "event: message" ]]; then
      # Next "data:" line contains the payload
      read -r data_line

      # Debounce: skip if we woke recently (prevents flooding on burst messages)
      NOW=$(date +%s)
      ELAPSED=$((NOW - LAST_WAKE))
      if [ "$ELAPSED" -lt "$MIN_WAKE_INTERVAL" ]; then
        echo "[sse-listener] Message received, skipping wake (last wake ${ELAPSED}s ago)"
        continue
      fi
      LAST_WAKE=$NOW

      echo "[sse-listener] Message received, waking agent $AGENT_ID ..."
      # Wake this specific agent via --agent flag
      openclaw agent --agent "$AGENT_ID" --message "New channel message — check channels" --deliver 2>/dev/null \
        || openclaw system event --text "New channel message received" --mode now 2>/dev/null \
        || true
    fi

    # Reset retry delay on any successful data (connection is alive)
    if [[ "$line" == "event: heartbeat" ]]; then
      delay=$RETRY_DELAY
    fi

  done

  # Connection dropped — reconnect with backoff
  echo "[sse-listener] Connection lost. Reconnecting in ${delay}s..."
  sleep "$delay"
  delay=$((delay * 2))
  if [ "$delay" -gt "$MAX_RETRY_DELAY" ]; then
    delay=$MAX_RETRY_DELAY
  fi
done

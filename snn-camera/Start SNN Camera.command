#!/bin/bash
# Double-click me in Finder to open SNN Camera in its own window.
# Keep the Terminal window open while you use the app. Close it to stop.

cd "$(dirname "$0")" || exit 1
PORT=8765

open_app() {   # open the page in Chrome as its own app window (or your normal browser if no Chrome)
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$1"
  else
    open "$1"
  fi
}

# Your Mac moves files to iCloud when the disk is full. Pull them back first, or the page loads half-empty.
command -v brctl >/dev/null && brctl download . >/dev/null 2>&1
find . -type f -exec cat {} + > /dev/null 2>&1

if ! command -v python3 >/dev/null; then
  echo "python3 isn't installed, so opening the page directly. The SNN works; YOLO and Roboflow need python3."
  open_app "file://$PWD/index.html"
  exit 0
fi

# Already running? Just open it.
if curl -s --max-time 1 "http://127.0.0.1:$PORT/api/roboflow/status" | grep -q configured; then
  open_app "http://127.0.0.1:$PORT/index.html"
  exit 0
fi

# Something else using the port (like an old copy)? Use the next free one.
while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

python3 server.py "$PORT" &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
for _ in $(seq 1 50); do   # wait (up to 5 seconds) for the server to wake up
  curl -s --max-time 1 "http://127.0.0.1:$PORT/api/roboflow/status" >/dev/null && break
  kill -0 "$SERVER" 2>/dev/null || { echo "The server didn't start (see above)."; read -r -p "Press Return to close."; exit 1; }
  sleep 0.1
done

echo "Running. Keep this window open. Close it to stop."
open_app "http://127.0.0.1:$PORT/index.html"
wait "$SERVER"

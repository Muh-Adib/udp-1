#!/bin/bash
# Auto-restart dev server if sandbox reaper kills it
cd /home/z/my-project
while true; do
  if ! pgrep -f "next dev" > /dev/null; then
    echo "[$(date '+%H:%M:%S')] dev server down — restarting..." >> dev.log
    bun run dev >> dev.log 2>&1
  fi
  sleep 3
done

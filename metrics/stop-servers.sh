#!/usr/bin/env bash
# Stops any `next start` server (their process title starts with "next-server").
for d in /proc/[0-9]*; do
  pid=${d#/proc/}; [ "$pid" = "$$" ] && continue
  c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
  case "$c" in next-server*) kill "$pid" && echo "stopped $pid";; esac
done

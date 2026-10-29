#!/usr/bin/env bash
# Runs every browser measurement sequentially. Needs `next start` on :3100 (local DB) and
# :3101 (DB behind metrics/db-latency-proxy.mjs, 40 ms each way). Usage: metrics/run-all.sh <suffix>
set -u
S=${1:-after}
LAT=http://localhost:3101
node metrics/browser/vitals.mjs vitals-$S
node metrics/browser/streaming.mjs streaming-$S
THROTTLE=0 node metrics/browser/streaming.mjs streaming-unthrottled-$S
BASE=$LAT node metrics/browser/streaming.mjs streaming-dblat-$S
BASE=$LAT THROTTLE=0 node metrics/browser/streaming.mjs streaming-dblat-unthrottled-$S
node metrics/browser/a11y-routes.mjs a11y-routes-$S
node metrics/browser/a11y-builder.mjs a11y-builder-$S
node metrics/browser/theming-fouc.mjs theming-fouc-$S
node metrics/browser/lighthouse.mjs lighthouse-$S

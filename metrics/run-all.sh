#!/usr/bin/env bash
# Runs every browser measurement sequentially against the server on :3100.
# Usage: metrics/run-all.sh <suffix>   (e.g. before | after)
set -u
S=${1:-before}
node metrics/browser/vitals.mjs vitals-$S
node metrics/browser/streaming.mjs streaming-$S
THROTTLE=0 node metrics/browser/streaming.mjs streaming-unthrottled-$S
node metrics/browser/a11y-routes.mjs a11y-routes-$S
node metrics/browser/a11y-builder.mjs a11y-builder-$S
node metrics/browser/theming-fouc.mjs theming-fouc-$S
node metrics/browser/lighthouse.mjs lighthouse-$S

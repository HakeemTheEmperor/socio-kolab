#!/usr/bin/env bash
# Proves the form-builder safety check can fail: break src/lib/event-responses.ts two ways, expect red each time, restore.
set -u
F=src/lib/event-responses.ts; cp $F /tmp/event-responses.bak
run() { npx vitest run -c metrics/vitest.config.ts form-builder 2>&1 | grep -E "Property failed after|passed" | head -1; }
echo "baseline (unmodified):"; run
sed -i 's/if (!known.has(key) \&\& !seenOrphans.has(key)) {/if (false) {/' $F
echo "mutation 1 — orphaned answers dropped from the report:"; run; cp /tmp/event-responses.bak $F
sed -i 's/id: f.id,/id: formSchema[(formSchema.indexOf(f)+1)%formSchema.length].id,/' $F
echo "mutation 2 — columns keyed by the neighbouring field's id:"; run; cp /tmp/event-responses.bak $F
git diff --quiet -- $F && echo "source restored"

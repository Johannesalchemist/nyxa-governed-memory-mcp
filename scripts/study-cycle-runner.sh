#!/bin/sh
set -eu
cd /opt/nyxa-governed-memory-mcp-dev
# Independent, inert frontier checkpoint. A failure must never grant study completion.
/usr/bin/node scripts/research-frontier-checkpoint.mjs
/usr/bin/node scripts/study-cycle.mjs
# Comprehension is bounded: failure cannot promote study status.
/usr/bin/node scripts/study-comprehension.mjs

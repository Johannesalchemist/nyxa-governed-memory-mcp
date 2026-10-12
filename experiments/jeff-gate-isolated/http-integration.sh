#!/usr/bin/env bash
set -euo pipefail
cd /opt/nyxa-governed-memory-mcp-dev/experiments/jeff-gate-isolated
D=$(mktemp -d /tmp/nyxa-jeff-gate-test.XXXXXX)
P=18743
export NYXA_DATA_DIR="$D/data" NYXA_AGENT_MODE=draft NYXA_GATE_PORT="$P" NYXA_GATE_HOST=127.0.0.1 NYXA_GATE_SECRET='test-only-nyxa-gate-secret-32chars-123456'
node dist/index.js > "$D/server.log" 2>&1 < /dev/null & PID=$!
trap 'kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do if curl -fsS "http://127.0.0.1:$P/health" > /dev/null 2>&1; then break; fi; sleep .2; done
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const base='http://127.0.0.1:18743';const secret='test-only-nyxa-gate-secret-32chars-123456';
async function request(path,body,token){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-nyxa-gate-secret':token}:{})},body});return {status:r.status,body:await r.json()};}
let r=await request('/v1/jeff-evidence','{}');assert.equal(r.status,401);
r=await request('/v1/jeff-evidence','{}','wrong-secret');assert.equal(r.status,401);
r=await request('/v1/jeff-evidence','{"evil":true}',secret);assert.equal(r.status,400);
r=await request('/v1/jeff-evidence','null',secret);assert.equal(r.status,400);
r=await request('/v1/jeff-evidence','[]',secret);assert.equal(r.status,400);
r=await request('/v1/jeff-evidence','{}',secret);assert.equal(r.status,404);assert.equal(r.body.error,'jeff_evidence_missing');
r=await request('/v1/not-real','{}',secret);assert.equal(r.status,404);
console.log('HTTP_INTEGRATION_PASS 7 cases');
JS

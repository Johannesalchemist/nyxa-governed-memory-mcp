#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'ERROR: root required'; exit 1; }
[[ $(hostname -s) == ubuntu-4gb-nbg1-1 ]] || { echo 'ERROR: wrong host'; exit 1; }
SRC=/opt/nyxa-governed-memory-mcp-dev/experiments/human-gate-v2
ART=/opt/nyxa-governed-memory-mcp-dev/experiments/jeff-gate-isolated/dist/server.js
PASS=/var/lib/sentinelx/uploads/nyxa-passkey-v1
INSTALL=/opt/nyxa-human-gate-v2
EXPECTED=$(python3 -c 'import json;print(json.load(open("'"$SRC"'/transactions.json"))["transactions"][0]["artifact_sha256"])')
ACTUAL=$(sha256sum "$ART" | awk '{print $1}')
[[ $ACTUAL == "$EXPECTED" ]] || { echo "ERROR: artifact hash mismatch expected=$EXPECTED actual=$ACTUAL"; exit 1; }
node --check "$SRC/passkey-server-v2.mjs"
node --check "$SRC/jeff-memory-sync.mjs"
node --check "$SRC/sophia-evidence-loader.cjs"
python3 -m py_compile "$SRC/nyxa-human-gate-executor.py"
systemd-analyze verify "$SRC/nyxa-jeff-sync.service" "$SRC/nyxa-jeff-sync.timer"
command -v visudo >/dev/null
docker inspect nyxa-passkey-v1 >/dev/null
systemctl is-active --quiet nyxa-governed-memory-mcp.service

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ROLLBACK=/var/backups/nyxa-human-gate-v2/$STAMP
mkdir -p "$ROLLBACK" "$INSTALL" /etc/nyxa /var/lib/nyxa-human-gate-v2 /var/lib/nyxa-jeff-sync
chmod 0700 "$ROLLBACK" /var/lib/nyxa-human-gate-v2
cp -a "$PASS/server.mjs" "$ROLLBACK/passkey-server.mjs"
cp -a /usr/local/sbin/nyxa-bounded-ops "$ROLLBACK/nyxa-bounded-ops"
cp -a /opt/thechat/codex/agent-factory/storage/jeff-advisory-v1.cjs "$ROLLBACK/jeff-advisory-v1.cjs"
[[ ! -e /etc/systemd/system/nyxa-governed-memory-mcp.service.d/20-jeff-gateway.conf ]] || cp -a /etc/systemd/system/nyxa-governed-memory-mcp.service.d/20-jeff-gateway.conf "$ROLLBACK/"

install -o root -g root -m 0644 "$SRC/passkey-server-v2.mjs" "$PASS/server.mjs"
install -o root -g root -m 0444 "$SRC/transactions.json" "$PASS/data/transactions.json"
if [[ ! -s "$PASS/data/human-gate-private.pem" ]]; then
  umask 077
  openssl genpkey -algorithm Ed25519 -out "$PASS/data/human-gate-private.pem"
fi
chmod 0400 "$PASS/data/human-gate-private.pem"
openssl pkey -in "$PASS/data/human-gate-private.pem" -pubout -out /etc/nyxa/human-gate-public.pem
chmod 0444 /etc/nyxa/human-gate-public.pem
mkdir -p "$PASS/data/authority-grants"/{issued,revoked,failed}
chmod 0700 "$PASS/data/authority-grants" "$PASS/data/authority-grants"/*

install -o root -g root -m 0644 "$SRC/jeff-memory-sync.mjs" "$INSTALL/jeff-memory-sync.mjs"
install -o root -g root -m 0644 "$SRC/sophia-evidence-loader.cjs" "$INSTALL/sophia-evidence-loader.cjs"
install -o root -g root -m 0755 "$SRC/nyxa-human-gate-executor.py" /usr/local/lib/nyxa-bounded-ops/human_gate_executor.py

python3 - <<'PY'
from pathlib import Path
p=Path('/usr/local/sbin/nyxa-bounded-ops')
s=p.read_text()
anchor='if len(sys.argv)!=2 or sys.argv[1] not in ("c-inventory","tunnel-restart","c-cafe-inspect","c-cafe-start","c-cafe-stop"):\n'
block='if len(sys.argv)==3 and sys.argv[1]=="deploy-memory-gateway":\n    os.execv("/usr/local/lib/nyxa-bounded-ops/human_gate_executor.py", ["human_gate_executor.py", *sys.argv[1:]])\n'
if block not in s:
    if anchor not in s: raise SystemExit('ERROR: bounded executor anchor changed')
    s=s.replace(anchor,block+anchor,1)
tmp=p.with_suffix('.new');tmp.write_text(s);tmp.chmod(0o755)
compile(tmp.read_text(),str(tmp),'exec')
tmp.replace(p)
PY
cat >/etc/sudoers.d/nyxa-human-gate-v2 <<'EOF'
sentinelx ALL=(root) NOPASSWD: /usr/local/sbin/nyxa-bounded-ops deploy-memory-gateway *
EOF
chmod 0440 /etc/sudoers.d/nyxa-human-gate-v2
visudo -cf /etc/sudoers.d/nyxa-human-gate-v2

if [[ ! -s /etc/nyxa/jeff-gateway.secret ]]; then
  umask 077
  openssl rand -base64 48 | tr -d '\n' > /etc/nyxa/jeff-gateway.secret
fi
chown root:nyxamcp /etc/nyxa/jeff-gateway.secret
chmod 0640 /etc/nyxa/jeff-gateway.secret
{ printf 'NYXA_GATE_SECRET='; cat /etc/nyxa/jeff-gateway.secret; printf '\nNYXA_GATE_PORT=18743\nNYXA_GATE_HOST=127.0.0.1\nNYXA_JEFF_EVIDENCE_MAX_AGE_SECONDS=86400\n'; } > /etc/nyxa/jeff-gateway.env
chown root:nyxamcp /etc/nyxa/jeff-gateway.env
chmod 0640 /etc/nyxa/jeff-gateway.env
mkdir -p /etc/systemd/system/nyxa-governed-memory-mcp.service.d
cat >/etc/systemd/system/nyxa-governed-memory-mcp.service.d/20-jeff-gateway.conf <<'EOF'
[Service]
EnvironmentFile=/etc/nyxa/jeff-gateway.env
EOF

id -u nyxasync >/dev/null 2>&1 || useradd --system --home /var/lib/nyxa-jeff-sync --shell /usr/sbin/nologin nyxasync
chown nyxasync:nyxasync /var/lib/nyxa-jeff-sync
chmod 0755 /var/lib/nyxa-jeff-sync
install -o root -g root -m 0644 "$SRC/nyxa-jeff-sync.service" /etc/systemd/system/nyxa-jeff-sync.service
install -o root -g root -m 0644 "$SRC/nyxa-jeff-sync.timer" /etc/systemd/system/nyxa-jeff-sync.timer
sed -i "s#/opt/nyxa-governed-memory-mcp-dev/experiments/human-gate-v2/sophia-evidence-loader.cjs#/opt/nyxa-human-gate-v2/sophia-evidence-loader.cjs#" /opt/thechat/codex/agent-factory/storage/jeff-advisory-v1.cjs
systemctl daemon-reload
systemctl enable nyxa-jeff-sync.timer
docker restart nyxa-passkey-v1 >/dev/null
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3457/health >/dev/null 2>&1 && break; sleep .2; done
curl -fsS http://127.0.0.1:3457/health
curl -fsS https://auth.future24.eu/health
node /opt/thechat/codex/agent-factory/storage/jeff-advisory-v1.test.cjs
echo "BOOTSTRAP_READY rollback=$ROLLBACK artifact_sha256=$ACTUAL"
echo 'MCP runtime was not changed or restarted. Next step: approve the displayed transaction with the existing passkey.'

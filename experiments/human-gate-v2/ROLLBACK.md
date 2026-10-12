# NYXA Human Gate V2 rollback

The bootstrap installer prints its timestamped backup directory under
`/var/backups/nyxa-human-gate-v2/`.

1. Stop and disable `nyxa-jeff-sync.timer`.
2. Restore `passkey-server.mjs`, `nyxa-bounded-ops`, and `jeff-advisory-v1.cjs`
   from the selected timestamped backup.
3. Remove `/etc/sudoers.d/nyxa-human-gate-v2` and validate the full sudoers
   configuration with `visudo -cf /etc/sudoers`.
4. Remove `20-jeff-gateway.conf`, reload systemd, and restart the passkey
   container. Do not restart the MCP unless its runtime was changed.
5. If the authorized deployment ran, restore the exact backup recorded in
   `/var/log/nyxa-human-gate-v2.jsonl`, restart the MCP, verify its prior SHA-256,
   service state, and MCP health.

Never delete the consumed-grant or audit records during rollback; they are the
replay barrier and the evidentiary record.

# NYXA CandidateStore P0: Build- und Integritätsnachweise

Stand: 20.10.2026. Zielhost: `ubuntu-4gb-nbg1-1` (SentinelX); lesende Runtime-Prüfung, keine produktiven Änderungen.
Evidence-Snapshot: `2026-10-20T18:59:34.569Z`. JSON-Fingerprints: `docs/NYXA_MEMORY_INTEGRITY_EVIDENCE_2026-10-20.json`.

## Build und Tests
- Basis: `jev-weight-evolution-v0` bei `4fdfd049c84dd8ccc2a198912fd957dfba5f3fa1`.
- Kandidatenspeicher-Hardening: `222d3788531432f7312fbd245eb6902231fee6f0`.
- Build-Fix: `ed69277` (drei fehlende Jura-Module, vier Tests, korrigierte Dream- und Memory-Fixtures).
- **Frischer isolierter Worktree** von `ed69277`: `npm ci --offline` und `npm run test:all` erfolgreich, inklusive TypeScript-Build, **18/18** Standardtests und **1/1** MCP-Integrationstest.
- Erweiterte Suite (Memory, Dreaming, Learning Evidence, Learning Ratchet, Jura): **74/74** bestanden aus demselben Clean-Worktree.
- Die Dream-Ablation verwendete zuvor `FACT` ohne den geforderten Evidence-Passport. Korrektur im Test auf `CLAIM`, keine Abschwächung der Governance.
- Die alte Memory-Fixture schrieb während eines laufenden MCP-Prozesses außerhalb dessen WriterLock. Daten werden nun vor dem MCP-Start angelegt.
- Die drei ergänzten Jura-Module melden Quelle/Relevanz ausdrücklich als nicht attestiert; sie verleihen weder Prüfungserfolg noch rechtliche Autorität.

## Unveränderter Runtime-Datenbestand
| Root | Audit-Ereignisse | Unverkettete Legacy-Ereignisse | Kettenbrüche | Audit-Validator | Kandidaten-Store |
|---|---:|---:|---:|---|---|
| `data` | 308 | 15 | 0 | PASS mit Legacy-Semantik | PASS (1 Eintrag) |
| `data-tunnel-v2` | 8.137 | 0 | 0 | PASS | PASS (56 Einträge) |
| `data-claude-bridge` | 388 | 15 | **1** | **FAIL** | PASS (leer) |

**Gesamtergebnis Audit-Integrität: FAIL.** Die initialen 15 Legacy-Ereignisse in `data` und `data-claude-bridge` besitzen keine Hash-Verkettung; eine kryptografische lückenlose Herkunft seit dem ersten Ereignis ist dadurch nicht belegt.

Claude-Bridge: Der einzige gefundene Kettenbruch liegt bei Index 284 (0-basiert), Ereignis 285, 06.09.2026 15:54:50 UTC. Er referenziert den Ereignis-Hash bei Index 281 statt Index 283; Indizes 282–283 werden übersprungen. Der Eigenhash des Ereignisses ist gültig. Ein konkurrierender Write mit veraltetem Kettenkopf ist plausibel, die genaue Ursache nicht bewiesen.

Die Originaldateien wurden weder verändert noch repariert. Der bestehende AuditGuard überprüft nur `data-tunnel-v2`. Ein einmaliger erfolgreicher Audit-Check kann historische Kettenbrüche nicht korrigieren.

## Reproduzierbare Befehle
```bash
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run test:all
node --test tests/candidate-store-hardening.test.mjs tests/memory-governance.test.mjs tests/dream-cycle-e2e.test.mjs tests/dream-ablation.test.mjs tests/learning-evidence-store.test.mjs tests/learning-ratchet.test.mjs tests/law-primary-source-registry-v1.test.mjs tests/law-registered-source-gate-v1.test.mjs tests/law-exam-preflight-v1.test.mjs tests/law-exam-source-relevance-v1.test.mjs
node scripts/verify-memory-audit-readonly.mjs /opt/nyxa-governed-memory-mcp-runtime/data /opt/nyxa-governed-memory-mcp-runtime/data-tunnel-v2 /opt/nyxa-governed-memory-mcp-runtime/data-claude-bridge
```

Der Read-only-Forensik-CLI gibt bei vollständiger Integrität Exitcode 0 und bei jedem festgestellten Integritätsdefizit Exitcode 2 zurück. Aktuell: Tunnel-V2 allein Exit 0, alle drei Stores zusammen Exit 2. Die JSON-Datei ist ein zeitgebundener Snapshot und ersetzt keine fortlaufende Überwachung.

## Abnahme
- **BUILD: PASS**
- **ISOLIERTE FUNKTIONS-/SICHERHEITSTESTS: PASS** (auf Umfang oben begrenzt)
- **CANDIDATE-CHAIN-KOMPATIBILITÄT: PASS** für drei beobachtete Datenverzeichnisse
- **GESAMTE AUDIT-INTEGRITÄT: FAIL** (Claude-Bridge; Legacy-Einschränkungen)
- **PRODUKTIVE FREIGABE: HOLD**. Kein produktiver Build, Neustart, Merge oder E2E-Wirkungsnachweis.

Vor produktivem Deployment sind die Ursache und das weitere Handling des defekten historischen Audit-Ledgers, forward-fail-closed Audit-Schreiben, exakte Dienst-/Datenidentität, Rollback sowie ein Staging-E2E mit realem ALLOW/DENY zu verifizieren.
# NYXA HammerHAI Avatar Lab - install-ready package

Purpose: reproducible HammerHAI deployment for governed real-time full-body avatars, Newsroom media forensics, Sapio community experiments, and evidence-first market validation.

Deployment target assumptions are deliberately minimal: Linux + NVIDIA GPU, container runtime, persistent storage, outbound model/API access as approved. HammerHAI-specific scheduler/storage bindings are injected at install time.

Components:
- gateway: session/API ingress
- realtime-avatar: ASR -> dialogue -> TTS -> face/body motion -> renderer adapter
- newsroom: multi-model media/creator analysis and cross-review
- media-forensics: video/audio/frame evidence extraction
- experiment-runner: variant tests with constructive-engagement metrics
- nyxa-gate: proposal/effect/evidence boundary; no direct authoritative writes
- sapio-bridge: opt-in community integration
- evidence-store: manifests, hashes, receipts, experiment protocol

Guardrails: disclose synthetic avatars; no covert identity deception; no vulnerability targeting; no outrage/fear optimization; no private-person identification; public/authorized media only; provenance on generated and analyzed media.

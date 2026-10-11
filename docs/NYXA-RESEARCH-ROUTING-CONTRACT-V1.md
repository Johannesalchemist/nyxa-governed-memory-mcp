# NYXA Research Routing Contract V1

Status: DEVELOPMENT CONTRACT, not deployed or live verified.

Modes:
- JEV_AUTO: E0 delegates routing decision to existing JEV decision callback.
- DIRECT_RESEARCH: authorized caller explicitly selects external research.
- INDEPENDENT_CHECK: authorized caller explicitly selects diversity-gated independent research.

All modes implement the existing ResearchProvider interface and feed findings into the existing E0 depth-drill and evidence pipeline. The mode adapter cannot grant authority, mutate governance or promote memory. Governed invocation and budgets remain mandatory at the caller boundary.

The OpenRouter transport is shared; model families and model IDs are from the existing Newsroom model registry. Distinct model-vendor identities do not establish independent inference or independent sources. Model response IDs and model IDs are checked, but serving-provider routing may be opaque. Source URLs are unverified until fetched and validated independently.

Outstanding integration gates:
1. Connect the real JEV decision service, not a heuristic substitute.
2. Connect authorized E0 runtime entrypoints and enforce cost/time budgets.
3. Run live OpenRouter integration tests, including substitution, outage, same-vendor, common-source and malicious-source cases.
4. Validate primary-source URLs with the existing governed retrieval adapter.
5. Persist audit/evidence receipts in existing NYXA ledger and run end-to-end governance regression.
6. Verify production packaging and deployment separately.

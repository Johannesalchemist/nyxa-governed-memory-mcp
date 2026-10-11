# NYXA Passkey to Mandate Bridge V1

Status: IMPLEMENTATION CONTRACT ONLY. NOT CONNECTED OR DEPLOYED.
Date: 2026-10-11

## Verified current boundary
- WebAuthn registration and login on auth.future24.eu have been user-confirmed.
- Current passkey login does NOT issue NYXA human grants or mandates.
- NYXA HumanGrantStore issues exact-capability, exact-target, single-use grants with expiry and atomic consumption.
- NYXA mandate issuance currently requires an out-of-band authority token; a successful browser login is NOT that token.
- The passkey service file is not readable through the currently allowed SentinelX file paths. Do not bypass this allowlist or assume implementation details beyond previously verified behavior.

## Required integration
1. The requester submits an immutable approval intent: actor, action, target, scope, expiry, quota, request ID and nonce. Server computes a canonical SHA-256 intent digest.
2. Passkey auth service starts a NEW WebAuthn challenge bound server-side to that exact digest, requester session and short expiry. Require user verification; ordinary login cannot approve an action.
3. After verifying origin, RP ID, challenge, authenticator signature, credential ownership, UV and counter policy, auth service issues a short-lived one-time signed assertion for the exact intent. Include issuer, audience, subject, jti, iat, exp, intent digest and assurance method. No bearer token in URL or logs.
4. NYXA verifies signature using a pinned public key, issuer, audience, expiry, nonce, exact intent digest, and atomic jti replay reservation. It then issues ONLY the requested bounded grant/mandate using the existing governed store. Never expose the NYXA_HUMAN_AUTHORITY_TOKEN to browser or public auth service.
5. Mandate issuance still passes the existing capability gate, action/scope restrictions, max executions/effect budgets and audit. Sensitive actions can require a fresh passkey ceremony; routine actions stay within preapproved mandates.
6. Failure of the auth service, missing verification, denied governance, replay, clock skew, or key rotation mismatch MUST fail closed. No connector fallback can override a DENY.

## Acceptance tests before deployment
- valid approval intent yields exactly one matching grant/mandate
- login alone yields no authority
- changed target, action, scope, quota or expiry rejected
- expired assertion, reused jti, wrong audience, unknown key, wrong origin, UV missing rejected
- concurrent replay rejected atomically
- revoked mandate denied; routine operations within bounded mandate proceed without new fingerprint
- end-to-end audit contains non-secret evidence and correlation IDs
- service restart and key rotation preserve replay protection and fail closed

## Rollout
- Implement in a separate dev branch; do not modify the live auth container before read access and explicit test evidence.
- Validate against real WebAuthn in staging and existing NYXA regression suite.
- Deploy only after verified rollback and negative-test evidence.

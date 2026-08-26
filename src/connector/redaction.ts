const patterns: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
  /\b(?:password|passwd|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi
];

export type SanitizedText = { text: string; truncated: boolean; redactions: number };

export function redactText(value: string): { text: string; redactions: number } {
  let text = value;
  let redactions = 0;
  for (const pattern of patterns) {
    text = text.replace(pattern, () => {
      redactions += 1;
      return "[REDACTED]";
    });
  }
  return { text, redactions };
}

export function sanitizeText(value: string, maxChars: number): SanitizedText {
  const redacted = redactText(value);
  if (redacted.text.length <= maxChars) return { text: redacted.text, truncated: false, redactions: redacted.redactions };
  return {
    text: `${redacted.text.slice(0, maxChars)}\n[TRUNCATED]`,
    truncated: true,
    redactions: redacted.redactions
  };
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalize(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value as JsonValue;
  }

  if (valueType === "bigint") {
    return String(value);
  }

  if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
    return `[${valueType}]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, seen));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    if (seen.has(objectValue)) {
      return "[Circular]";
    }

    seen.add(objectValue);

    const sortedKeys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b));
    const out: { [key: string]: JsonValue } = {};

    for (const key of sortedKeys) {
      out[key] = normalize(objectValue[key], seen);
    }

    return out;
  }

  return "[Unsupported]";
}

export function safeJsonStringify(value: unknown, spacing = 0): string {
  const normalized = normalize(value, new WeakSet<object>());
  return JSON.stringify(normalized, null, spacing);
}

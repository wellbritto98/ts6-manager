const REDACTED = '[REDACTED]';
const CYCLE = '[Cycle]';
const MAX_STRING_LENGTH = 8_000;
const SECRET_KEYS = new Set([
  'apikey',
  'password',
  'token',
  'cookie',
  'secret',
  'authorization',
  'certificate',
]);

export function sanitizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return CYCLE;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeForLog(item, seen),
    ]),
  );
}

const REDACTED = '[REDACTED]';

/**
 * `key=value` pairs whose key names a credential. Server logs quote values
 * inconsistently, so the quote (if any) is preserved around the placeholder.
 */
const LABELLED_SECRET =
  /\b(api[_-]?key|apikey|token|password|passwd|secret|authorization|cookie|certificate)(\s*[=:]\s*)("?)([^\s",;]+)\3/gi;

/**
 * Standalone credential-shaped values: long mixed-case tokens with at least
 * one digit. The length floor and the character class keep client UIDs (28
 * base64 chars) and filesystem paths out of the match.
 */
const BARE_SECRET = /\b(?=[A-Za-z0-9+_-]*[A-Z])(?=[A-Za-z0-9+_-]*[a-z])(?=[A-Za-z0-9+_-]*\d)[A-Za-z0-9+_-]{40,}={0,2}/g;

const SECRET_KEYS = new Set([
  'apikey',
  'api_key',
  'password',
  'token',
  'cookie',
  'secret',
  'authorization',
  'certificate',
]);

export function redactLogText(text: string): string {
  return text
    .replace(LABELLED_SECRET, (_match, key: string, sep: string, quote: string) => `${key}${sep}${quote}${REDACTED}${quote}`)
    .replace(BARE_SECRET, REDACTED);
}

/**
 * Redact secrets from `logview` entries: credential-named fields lose their
 * value outright, and free-form log lines are scrubbed for key-shaped values.
 */
export function redactLogEntries(entries: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return entries.map((entry) =>
    Object.fromEntries(
      Object.entries(entry).map(([key, value]) => {
        if (SECRET_KEYS.has(key.toLowerCase())) return [key, REDACTED];
        return [key, typeof value === 'string' ? redactLogText(value) : value];
      }),
    ),
  );
}


/**
 * Robustly parses a JSON environment variable.
 * Handles:
 * 1. Standard JSON
 * 2. JSON wrapped in single or double quotes
 * 3. Double-stringified JSON
 * 4. Base64 encoded JSON (if the key ends with _B64 or if detection fails)
 */
export function parseEnvJson<T>(key: string): T | null {
  const value = process.env[key];
  if (!value) return null;

  let content = value.trim();

  // 1. Try Base64 decoding if it looks like base64 (optional heuristic, or explicit key)
  // A simple heuristic: if it doesn't start with { or [ or " or ', it might be base64
  if (!/^['"{[]/.test(content)) {
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf-8');
      // Verify if decoded looks like JSON
      if (/^[\s]*[{"[]/.test(decoded)) {
        try {
            return JSON.parse(decoded);
        } catch {}
      }
    } catch {}
  }

  // 2. Handle wrapping quotes
  if (
    (content.startsWith("'") && content.endsWith("'")) ||
    (content.startsWith('"') && content.endsWith('"'))
  ) {
    content = content.slice(1, -1);
  }

  // 3. Try parsing
  try {
    const result = JSON.parse(content);
    
    // 4. Handle double-stringified JSON (e.g. "{\"a\":1}")
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        // It was just a string, return it if that's what T expects, but usually we expect object/array
        return result as T;
      }
    }
    return result;
  } catch (error) {
    console.error(`Error parsing environment variable ${key}:`, error);
    return null;
  }
}

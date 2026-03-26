
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

export interface NumberedAccount {
  name: string;
  apiKey: string;
  secretKey: string;
  type: "PAPER" | "LIVE";
}

/**
 * Parses numbered Alpaca account env vars into an account list.
 *
 * Supported patterns (N = 1, 2, 3, ...):
 *   ALPACA_PAPER{N}_API_KEY / ALPACA_PAPER{N}_API_SECRET
 *   ALPACA_PAPER{N}_NAME  (optional, defaults to "Paper Account N")
 *   ALPACA_LIVE{N}_API_KEY  / ALPACA_LIVE{N}_API_SECRET
 *   ALPACA_LIVE{N}_NAME   (optional, defaults to "Live Account N")
 *
 * Scanning stops for a type when two consecutive numbers are missing.
 */
export function parseNumberedAccounts(): NumberedAccount[] {
  const accounts: NumberedAccount[] = [];

  for (const type of ["PAPER", "LIVE"] as const) {
    let n = 1;
    let consecutiveMissing = 0;
    while (consecutiveMissing < 2) {
      const apiKey = process.env[`ALPACA_${type}${n}_API_KEY`];
      const secretKey = process.env[`ALPACA_${type}${n}_API_SECRET`];
      if (apiKey && secretKey) {
        consecutiveMissing = 0;
        const name =
          process.env[`ALPACA_${type}${n}_NAME`] ||
          `${type === "PAPER" ? "Paper" : "Live"} Account ${n}`;
        accounts.push({ name, apiKey, secretKey, type });
      } else {
        consecutiveMissing++;
      }
      n++;
    }
  }

  return accounts;
}

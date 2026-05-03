/**
 * Payload Parser
 * Parses comma-separated key=value payloads from Marstek devices
 */

export interface ParsedPayload {
  [key: string]: string;
}

export function parsePayload(message: string): ParsedPayload {
  const values: ParsedPayload = {};
  const pairs = message.split(',');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [key, value] = trimmed.split('=');
    if (key !== undefined && value !== undefined) {
      values[key] = value;
    }
  }

  return values;
}

/**
 * Extract numeric value from payload
 */
export function getNumber(payload: ParsedPayload, key: string, defaultValue: number = 0): number {
  const value = payload[key];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Extract string value from payload
 */
export function getString(payload: ParsedPayload, key: string, defaultValue: string = ''): string {
  return payload[key] ?? defaultValue;
}

/**
 * Extract boolean from payload (0=false, 1=true)
 */
export function getBoolean(payload: ParsedPayload, key: string, defaultValue: boolean = false): boolean {
  const value = payload[key];
  if (value === undefined) return defaultValue;
  return value === '1';
}

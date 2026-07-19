export type JsonRecord = Record<string, unknown>;

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse a template-owned JSON document while keeping its field contract inside the Adapter. */
export function parseTemplateJsonObject<T>(text: string, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isJsonRecord(value)) throw new Error(`${label} must be an object`);
  return value as T;
}

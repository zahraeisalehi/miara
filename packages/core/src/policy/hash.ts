import { createHash } from 'node:crypto';

/** Deterministic JSON: object keys sorted, `undefined` dropped (as JSON.stringify does). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Approval binding (ARCHITECTURE "Risk tiers"): sha256(tool + canonical(args)). */
export function argsHash(tool: string, args: unknown): string {
  return createHash('sha256')
    .update(`${tool}\n${canonicalJson(args)}`)
    .digest('hex');
}

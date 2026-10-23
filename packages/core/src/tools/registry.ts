// Tool metadata for MCP, the router and the UI. Handlers are not reachable from here: only the policy gate runs tools.
import { z } from 'zod';

import { REDACTED } from '../redact/index.js';

import type { AnyToolDef, Tier } from './types.js';

export interface ToolInfo {
  name: string;
  description: { fa: string; en: string };
  tier: Tier;
  /** The tier can rise per call (tierFor or the circuit breaker). */
  dynamicTier: boolean;
  inputSchema: unknown;
  sensitive: readonly string[];
}

export interface ToolRegistry {
  list(): ToolInfo[];
  get(name: string): ToolInfo | undefined;
}

export function createToolRegistry(defs: readonly AnyToolDef[]): ToolRegistry {
  const seen = new Set<string>();
  const infos = defs.map((d): ToolInfo => {
    if (seen.has(d.name)) throw new Error(`Duplicate tool name: ${d.name}`);
    seen.add(d.name);
    return Object.freeze({
      name: d.name,
      description: d.description,
      tier: d.tier,
      dynamicTier: Boolean(d.tierFor || d.breaker),
      inputSchema: z.toJSONSchema(d.input, { io: 'input', unrepresentable: 'any' }),
      sensitive: d.sensitive ?? [],
    });
  });
  const byName = new Map(infos.map((i) => [i.name, i]));
  return {
    list: () => [...infos],
    get: (name) => byName.get(name),
  };
}

/** Masks `sensitive` paths (dot-separated). An object at a path keeps its keys with every value masked. */
export function maskSensitive(args: unknown, paths: readonly string[]): unknown {
  if (paths.length === 0 || typeof args !== 'object' || args === null) return args;
  const out = structuredClone(args) as Record<string, unknown>;
  for (const path of paths) {
    const keys = path.split('.');
    let node: Record<string, unknown> | undefined = out;
    for (const key of keys.slice(0, -1)) {
      const next: unknown = node?.[key];
      node =
        typeof next === 'object' && next !== null ? (next as Record<string, unknown>) : undefined;
    }
    const last = keys[keys.length - 1];
    if (!node || last === undefined || !(last in node)) continue;
    const value = node[last];
    node[last] =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).map((k) => [k, REDACTED]))
        : REDACTED;
  }
  return out;
}

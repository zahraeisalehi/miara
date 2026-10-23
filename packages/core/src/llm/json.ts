// zod → strict `response_format: json_schema` (docs/boxapi/README.md "Decisions from Spike A").
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/**
 * Strict mode needs every object closed (`additionalProperties: false`) with all keys required, so LLM output
 * schemas express optional fields as `.nullable()`, not `.optional()`. Throws on a schema that breaks this.
 */
export function assertStrictCompatible(schema: JsonSchema, path = '$'): void {
  if (schema.type === 'object' || schema.properties) {
    const props = Object.keys((schema.properties as JsonSchema | undefined) ?? {});
    const required = new Set((schema.required as string[] | undefined) ?? []);
    const missing = props.filter((p) => !required.has(p));
    if (missing.length) {
      throw new Error(
        `${path}: strict json_schema needs ${missing.join(', ')} required (use .nullable())`,
      );
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`${path}: strict json_schema needs additionalProperties: false`);
    }
  }
  for (const [key, value] of Object.entries(schema)) {
    if (typeof value !== 'object' || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null)
          assertStrictCompatible(v as JsonSchema, `${path}.${key}[${i}]`);
      });
    } else if (key === 'properties' || key === '$defs' || key === 'definitions') {
      for (const [name, sub] of Object.entries(value)) {
        assertStrictCompatible(sub as JsonSchema, `${path}.${name}`);
      }
    } else {
      assertStrictCompatible(value as JsonSchema, `${path}.${key}`);
    }
  }
}

export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _drop, ...json } = z.toJSONSchema(schema) as JsonSchema;
  void _drop;
  assertStrictCompatible(json);
  return json;
}

/** Accepts bare JSON or a fenced ```json block (the fallback path for providers without json_schema). */
export function parseJsonContent(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  return JSON.parse((fenced?.[1] ?? content).trim());
}

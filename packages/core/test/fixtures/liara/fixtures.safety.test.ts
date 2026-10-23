// Guards every committed Liara fixture: no credentials, no personal data, no env values.
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { REDACTED } from '../../../src/redact/index.js';

const DIR = import.meta.dirname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;
const BEARER = /Bearer\s+(?!\[REDACTED)/i;
const EMAIL = /[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

function envValues(value: unknown, parentKey = ''): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      /^envs?$/i.test(parentKey) && typeof item === 'object' && item !== null && 'value' in item
        ? [(item as { value: unknown }).value]
        : envValues(item, parentKey),
    );
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => envValues(v, k));
  }
  return [];
}

describe('Liara fixtures are redacted', () => {
  it('directory is readable (passes with zero fixtures)', () => {
    expect(Array.isArray(files)).toBe(true);
  });

  for (const file of files) {
    it(file, () => {
      const text = readFileSync(`${DIR}/${file}`, 'utf8');
      expect(text).not.toMatch(JWT);
      expect(text).not.toMatch(BEARER);
      expect(text).not.toMatch(EMAIL);
      for (const v of envValues(JSON.parse(text))) expect(v).toBe(REDACTED);
    });
  }
});

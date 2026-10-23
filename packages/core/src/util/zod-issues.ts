// Schema-mismatch diagnostics without values: issue paths, codes and zod's type messages
// ("expected string, received null"), never the input itself, so errors are safe to log.
import type { z } from 'zod';

export interface IssueSummary {
  path: string;
  code: string;
  message: string;
}

const MAX_ISSUES = 8;

export function summarizeIssues(issues: readonly z.core.$ZodIssue[]): IssueSummary[] {
  return issues.slice(0, MAX_ISSUES).map((i) => ({
    path: i.path.map(String).join('.') || '$',
    code: i.code,
    message: i.message,
  }));
}

/** One line for an error message, e.g. `releases.0.finishedAt (expected string, received null)`. */
export function issueLine(issues: readonly z.core.$ZodIssue[]): string {
  const shown = summarizeIssues(issues).map(
    (i) => `${i.path} (${i.message.replace(/^Invalid input: /, '')})`,
  );
  const more = issues.length > MAX_ISSUES ? `, +${issues.length - MAX_ISSUES} more` : '';
  return `${shown.join('; ')}${more}`;
}

// Runtime logs: v2 primary, v1 fallback (settled in Spike B, docs/liara/api-findings.md §4.6).
import type { LiaraClient } from './client.js';
import { LiaraError } from './errors.js';
import { V2LogEntry } from './schemas.js';
import type { V1LogsResponse, V2LogsResponse } from './schemas.js';
import type { z } from 'zod';

export interface LogLine {
  /** Milliseconds since epoch. */
  ts: number;
  stream: string;
  message: string;
  releaseId?: string;
}

export interface LogsResult {
  source: 'v2' | 'v1';
  lines: LogLine[];
}

/** v1 returns this CLI-upgrade notice as a log line; it is not app output. */
const V1_UPGRADE_NOTICE = /^Please upgrade your client using:/;

/** Flatten v2 groups and sort by the nanosecond timestamp, like the CLI (commands/app/logs.ts:245-247). */
export function flattenV2(body: z.infer<typeof V2LogsResponse>): LogLine[] {
  const rows: { ns: bigint; line: LogLine }[] = [];
  for (const group of body.data) {
    for (const [nsText, raw] of group.values) {
      let entry: { type: string; _entry: string };
      try {
        entry = V2LogEntry.parse(JSON.parse(raw));
      } catch {
        entry = { type: 'unknown', _entry: raw };
      }
      const ns = BigInt(nsText);
      rows.push({
        ns,
        line: {
          ts: Number(ns / 1_000_000n),
          stream: entry.type,
          message: entry._entry,
          ...(group.metaData?.releaseId ? { releaseId: group.metaData.releaseId } : {}),
        },
      });
    }
  }
  rows.sort((a, b) => (a.ns < b.ns ? -1 : a.ns > b.ns ? 1 : 0));
  return rows.map((r) => r.line);
}

export function fromV1(body: z.infer<typeof V1LogsResponse>): LogLine[] {
  return body
    .filter((l) => !V1_UPGRADE_NOTICE.test(l.message))
    .map((l) => ({ ts: Date.parse(l.datetime), stream: l.type, message: l.message }));
}

export async function getLogs(
  liara: LiaraClient,
  app: string,
  sinceUnix: number,
): Promise<LogsResult> {
  try {
    return { source: 'v2', lines: flattenV2(await liara.getLogsV2(app, sinceUnix)) };
  } catch (err) {
    // A bad token fails v1 too; anything else gets one try on the fallback.
    if (!(err instanceof LiaraError) || err.kind === 'unauthorized') throw err;
    return { source: 'v1', lines: fromV1(await liara.getLogsV1(app, sinceUnix)) };
  }
}

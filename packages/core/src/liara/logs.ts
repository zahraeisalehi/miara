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
  /** The newest lines of the window (at most `maxLines`), oldest first. */
  lines: LogLine[];
  /** False when the page cap was hit and Miara jumped ahead to the most recent minutes (a gap before them). */
  complete: boolean;
}

export interface LogsOptions {
  /** Keep only the newest N lines. Default 300. */
  maxLines?: number;
  /** Follow-loop page cap before jumping to the tail. Default 30. */
  maxPages?: number;
  now?: () => Date;
}

/** When the page cap is hit, re-start this many seconds before now so the newest lines are always included. */
const TAIL_JUMP_SECONDS = 120;
const TAIL_JUMP_PAGES = 10;

/** v1 returns this CLI-upgrade notice as a log line; it is not app output. */
const V1_UPGRADE_NOTICE = /^Please upgrade your client using:/;

/** Flatten v2 groups and sort by the nanosecond timestamp, like the CLI (commands/app/logs.ts:245-247). */
export function flattenV2(body: z.infer<typeof V2LogsResponse>): LogLine[] {
  return flattenV2Rows(body).map((r) => r.line);
}

/** Lines with their nanosecond timestamp (the only exact identity a v2 line has). */
function flattenV2Rows(body: z.infer<typeof V2LogsResponse>): { ns: bigint; line: LogLine }[] {
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
  return rows;
}

export function fromV1(body: z.infer<typeof V1LogsResponse>): LogLine[] {
  return body
    .filter((l) => !V1_UPGRADE_NOTICE.test(l.message))
    .map((l) => ({ ts: Date.parse(l.datetime), stream: l.type, message: l.message }));
}

/**
 * The NEWEST lines since `sinceUnix`. v2 answers one bounded page forward from `start`, so a long window would only
 * show its oldest page. Like the CLI's follow loop (commands/app/logs.ts:183-213), re-fetch from the last line's
 * second until nothing new arrives. Miara re-starts at the same second (and de-duplicates) instead of second + 1,
 * so a page that ends mid-second loses nothing. After `maxPages` it jumps to the last two minutes.
 */
async function followV2(
  liara: LiaraClient,
  app: string,
  sinceUnix: number,
  opts: Required<LogsOptions>,
): Promise<{ lines: LogLine[]; complete: boolean }> {
  const nowUnix = Math.floor(opts.now().getTime() / 1000);
  const seen = new Set<string>();
  let lines: LogLine[] = [];
  let complete = true;
  let start = sinceUnix;
  let budget = opts.maxPages;
  let jumped = false;

  for (;;) {
    if (budget <= 0) {
      if (jumped) break;
      // Too many pages: the newest lines matter most, so skip ahead and say so.
      complete = false;
      jumped = true;
      budget = TAIL_JUMP_PAGES;
      start = Math.max(start, nowUnix - TAIL_JUMP_SECONDS);
    }
    budget -= 1;
    const rows = flattenV2Rows(await liara.getLogsV2(app, start));
    const fresh = rows
      .filter(({ ns, line }) => {
        const key = `${ns}|${line.releaseId ?? ''}|${line.stream}|${line.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => r.line);
    const last = rows[rows.length - 1]?.line;
    if (fresh.length === 0) {
      // Nothing new: either the end, or a page that never left one second. Step past that second once.
      if (last && Math.floor(last.ts / 1000) === start && start < nowUnix) {
        start += 1;
        continue;
      }
      break;
    }
    lines = [...lines, ...fresh].slice(-opts.maxLines);
    if (!last) break;
    const lastSecond = Math.floor(last.ts / 1000);
    if (lastSecond > nowUnix) break;
    start = Math.max(start, lastSecond);
  }
  return { lines, complete };
}

export async function getLogs(
  liara: LiaraClient,
  app: string,
  sinceUnix: number,
  options: LogsOptions = {},
): Promise<LogsResult> {
  const opts: Required<LogsOptions> = {
    maxLines: options.maxLines ?? 300,
    maxPages: options.maxPages ?? 30,
    now: options.now ?? (() => new Date()),
  };
  try {
    return { source: 'v2', ...(await followV2(liara, app, sinceUnix, opts)) };
  } catch (err) {
    // A bad token fails v1 too; anything else gets one try on the fallback.
    if (!(err instanceof LiaraError) || err.kind === 'unauthorized') throw err;
    const lines = fromV1(await liara.getLogsV1(app, sinceUnix));
    return { source: 'v1', lines: lines.slice(-opts.maxLines), complete: true };
  }
}

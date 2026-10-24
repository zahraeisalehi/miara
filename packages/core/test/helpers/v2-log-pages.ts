// A synthetic v2 log stream for paging tests: `count` lines, one every `stepMs`, served like Liara's v2 endpoint
// (one bounded page forward from `start`, unix seconds). Used by core and MCP tests.
import type { Reply } from './liara-mock.js';
import type { RecordedCall } from './liara-mock.js';

export interface SyntheticLogs {
  route: (call: RecordedCall) => Reply;
  first: number;
  last: number;
  message: (i: number) => string;
}

export function syntheticV2Logs(opts: {
  count: number;
  stepMs: number;
  endMs: number;
  pageSize?: number;
}): SyntheticLogs {
  const pageSize = opts.pageSize ?? 100;
  const firstMs = opts.endMs - (opts.count - 1) * opts.stepMs;
  const message = (i: number) => `line-${String(i).padStart(4, '0')}`;
  const tsOf = (i: number) => firstMs + i * opts.stepMs;
  const route = (call: RecordedCall): Reply => {
    const startMs = Number(call.query.start ?? '0') * 1000;
    const values: [string, string][] = [];
    for (let i = 0; i < opts.count && values.length < pageSize; i += 1) {
      if (tsOf(i) < startMs) continue;
      values.push([
        `${BigInt(tsOf(i)) * 1_000_000n}`,
        JSON.stringify({ type: 'stdout', _entry: message(i) }),
      ]);
    }
    return {
      status: 200,
      body: { data: values.length ? [{ metaData: { releaseId: 'r1' }, values }] : [] },
    };
  };
  return { route, first: firstMs, last: tsOf(opts.count - 1), message };
}

// The one HTTP function for api.liara.ir. Team mode, timeout, GET-only retries, zod at the boundary.
import type { z } from 'zod';

import { redactDeep, redactString } from '../redact/index.js';

import { LiaraError, kindForStatus } from './errors.js';

export const LIARA_ORIGIN = 'https://api.liara.ir';
export const LIARA_TIMEOUT_MS = 20_000;
export const GET_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1000];

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export interface HttpOptions {
  token: string;
  teamId?: string | undefined;
  secrets: readonly string[];
  fetch?: FetchLike;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface RequestSpec<S extends z.ZodType> {
  method: 'GET' | 'POST';
  /** Real path, e.g. `/v1/projects/my-app`. */
  path: string;
  /** Path template for errors and timeline, e.g. `/v1/projects/{app}`. */
  template: string;
  query?: Record<string, string | undefined>;
  json?: unknown;
  form?: FormData;
  schema: S;
  /** Overrides the 20 s default, e.g. for source uploads (the CLI sets no timeout: services/upload.ts:10-12). */
  timeoutMs?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(res: Response, attempt: number): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 10_000);
  const base = BACKOFF_MS[attempt] ?? 1000;
  return base + Math.floor(Math.random() * 100);
}

function liaraMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const m = (body as { message: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

export type LiaraHttp = <S extends z.ZodType>(spec: RequestSpec<S>) => Promise<z.infer<S>>;

export function createLiaraHttp(opts: HttpOptions): LiaraHttp {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? LIARA_TIMEOUT_MS;

  return async function request<S extends z.ZodType>(spec: RequestSpec<S>): Promise<z.infer<S>> {
    const endpoint = `${spec.method} ${spec.template}`;
    const url = new URL(spec.path, LIARA_ORIGIN);
    if (url.origin !== LIARA_ORIGIN) throw new Error(`Refusing non-Liara origin: ${url.origin}`);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    // Team mode, like the CLI's got beforeRequest hook (docs/vendor/liara-cli/src/base.ts:285-293).
    if (opts.teamId) url.searchParams.set('teamID', opts.teamId);

    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.token}`,
      accept: 'application/json',
    };
    let body: FormData | string | undefined;
    if (spec.form) body = spec.form;
    else if (spec.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(spec.json);
    }

    // Writes are never retried: a repeated restart/deploy/create is not idempotent.
    const attempts = spec.method === 'GET' ? GET_ATTEMPTS : 1;
    let last: LiaraError | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: spec.method,
          headers,
          ...(body !== undefined ? { body } : {}),
          signal: AbortSignal.timeout(spec.timeoutMs ?? timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && err.name === 'TimeoutError';
        // A write that may have reached Liara: never call it a plain failure.
        const kind = spec.method !== 'GET' ? 'unknown_outcome' : timedOut ? 'timeout' : 'network';
        last = new LiaraError({
          kind,
          status: 0,
          endpoint,
          raw: redactString(err instanceof Error ? err.message : String(err), opts.secrets),
        });
        if (attempt < attempts - 1) {
          await sleep(BACKOFF_MS[attempt] ?? 1000);
          continue;
        }
        throw last;
      }

      const text = await res.text();
      let parsedBody: unknown;
      try {
        parsedBody = text ? JSON.parse(text) : null;
      } catch {
        parsedBody = { _nonJson: text.slice(0, 500) };
      }

      if (!res.ok) {
        const safe = redactDeep(parsedBody, opts.secrets);
        const message = liaraMessage(safe);
        last = new LiaraError({
          kind: kindForStatus(res.status),
          status: res.status,
          endpoint,
          raw: safe,
          ...(message ? { liaraMessage: message } : {}),
        });
        if ((res.status === 429 || res.status >= 500) && attempt < attempts - 1) {
          await sleep(retryAfterMs(res, attempt));
          continue;
        }
        throw last;
      }

      const result = spec.schema.safeParse(parsedBody);
      if (!result.success) {
        throw new LiaraError({
          kind: 'invalid_response',
          status: res.status,
          endpoint,
          raw: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      return result.data;
    }
    throw last ?? new Error('unreachable');
  };
}

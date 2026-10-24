// HTTP probe of an app's public liara.run address: the "is it actually answering?" check behind check_health and
// every verify step (CLAUDE.md non-negotiable 6). The URL is always https://<app>.liara.run<path>, built here from a
// validated app name and path, so a tool input can never point the probe anywhere else. Redirects are not followed.

export const PROBE_TIMEOUT_MS = 10_000;
export const MAX_BODY_CHARS = 300;

const APP = /^[a-z0-9][a-z0-9-]*$/;
/** A plain absolute path (no scheme, host, userinfo or fragment); `//` at the start is refused separately. */
export const PROBE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/%?=&]*$/;

export type ProbeFailure = 'dns' | 'timeout' | 'connect' | 'tls' | 'other';

export interface ProbeResult {
  url: string;
  /** An HTTP answer arrived (any status). */
  reachable: boolean;
  /** reachable and status < 500. */
  healthy: boolean;
  status?: number;
  latencyMs: number;
  /** The first MAX_BODY_CHARS of the body (the gate redacts it like any result). */
  body?: string;
  failure?: ProbeFailure;
  messageFa: string;
  messageEn: string;
}

export type HttpProbe = (app: string, path: string) => Promise<ProbeResult>;

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export class ProbeInputError extends Error {
  override name = 'ProbeInputError';
}

export function probeUrl(app: string, path: string): URL {
  if (!APP.test(app)) throw new ProbeInputError(`Invalid app name for a probe: ${app}`);
  if (!PROBE_PATH.test(path)) throw new ProbeInputError(`Invalid probe path: ${path}`);
  const url = new URL(`https://${app}.liara.run${path}`);
  if (url.hostname !== `${app}.liara.run`) throw new ProbeInputError(`Invalid probe path: ${path}`);
  return url;
}

function codeOf(err: unknown): string | undefined {
  for (let e: unknown = err, i = 0; i < 4 && typeof e === 'object' && e !== null; i += 1) {
    if ('code' in e && typeof e.code === 'string') return e.code;
    e = 'cause' in e ? e.cause : undefined;
  }
  return undefined;
}

function classify(err: unknown): ProbeFailure {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))
    return 'timeout';
  const code = codeOf(err) ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'timeout';
  if (/^(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|UND_ERR_SOCKET)$/.test(code))
    return 'connect';
  if (/CERT|SSL|TLS/.test(code)) return 'tls';
  return 'other';
}

const FAILURE_TEXT: Record<ProbeFailure, { fa: string; en: string }> = {
  dns: {
    fa: 'نام دامنه‌ی اپ هنوز پیدا نمی‌شود (DNS). اگر اپ تازه ساخته شده، چند دقیقه صبر کنید.',
    en: "The app's address does not resolve (DNS). If the app is new, the record may still be propagating.",
  },
  timeout: {
    fa: 'اپ در زمان مقرر پاسخ نداد.',
    en: 'The app did not answer in time.',
  },
  connect: { fa: 'اتصال به اپ برقرار نشد.', en: 'Could not connect to the app.' },
  tls: { fa: 'گواهی HTTPS اپ مشکل دارد.', en: "The app's HTTPS certificate failed." },
  other: { fa: 'درخواست به اپ ناموفق بود.', en: 'The request to the app failed.' },
};

export function createHttpProbe(
  opts: { fetch?: FetchLike; timeoutMs?: number; now?: () => number } = {},
): HttpProbe {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const clock = opts.now ?? (() => Date.now());
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  return async (app, path) => {
    const url = probeUrl(app, path);
    const started = clock();
    try {
      const res = await doFetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': 'miara-probe' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await res.text().catch(() => '')).slice(0, MAX_BODY_CHARS);
      const latencyMs = clock() - started;
      const healthy = res.status < 500;
      return {
        url: url.href,
        reachable: true,
        healthy,
        status: res.status,
        latencyMs,
        body,
        messageFa: healthy
          ? `اپ پاسخ داد (HTTP ${res.status}، ${latencyMs} میلی‌ثانیه).`
          : `اپ با خطای سرور پاسخ داد (HTTP ${res.status}).`,
        messageEn: healthy
          ? `The app answered (HTTP ${res.status}, ${latencyMs} ms).`
          : `The app answered with a server error (HTTP ${res.status}).`,
      };
    } catch (err) {
      const failure = classify(err);
      return {
        url: url.href,
        reachable: false,
        healthy: false,
        latencyMs: clock() - started,
        failure,
        messageFa: FAILURE_TEXT[failure].fa,
        messageEn: FAILURE_TEXT[failure].en,
      };
    }
  };
}

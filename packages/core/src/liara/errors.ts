// Typed Liara errors with a plain Persian + English message (CLAUDE.md non-negotiable 5).

export type LiaraErrorKind =
  | 'network'
  | 'timeout'
  | 'unknown_outcome'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'too_large'
  | 'rate_limited'
  | 'server'
  | 'invalid_response';

const MESSAGES: Record<LiaraErrorKind, { fa: string; en: string }> = {
  network: {
    fa: 'ارتباط با لیارا برقرار نشد. اینترنت یا در دسترس بودن لیارا را بررسی کنید.',
    en: 'Could not reach Liara. Check the network or Liara status.',
  },
  timeout: {
    fa: 'لیارا در زمان مقرر (۲۰ ثانیه) پاسخ نداد.',
    en: 'Liara did not answer within 20 seconds.',
  },
  unknown_outcome: {
    fa: 'نتیجه مشخص نیست: درخواست ارسال شد اما پاسخی نرسید. وضعیت اپ را دوباره بررسی می‌کنیم.',
    en: 'The result is unclear: the request was sent but no answer came back. Re-checking the app state.',
  },
  unauthorized: {
    fa: 'توکن لیارا نامعتبر یا منقضی است. یک توکن تازه از کنسول لیارا بسازید.',
    en: 'The Liara token is invalid or expired. Create a new one in the Liara console.',
  },
  forbidden: {
    fa: 'این حساب (یا تیم) اجازه‌ی این کار را ندارد.',
    en: 'This account (or team) is not allowed to do this.',
  },
  not_found: {
    fa: 'پیدا نشد. نام اپ را بررسی کنید؛ اگر اپ در یک تیم است، LIARA_TEAM_ID باید تنظیم شود.',
    en: 'Not found. Check the app name; for a team app, LIARA_TEAM_ID must be set.',
  },
  bad_request: {
    fa: 'لیارا درخواست را نپذیرفت.',
    en: 'Liara rejected the request.',
  },
  conflict: {
    fa: 'تداخل: این نام یا منبع از قبل وجود دارد.',
    en: 'Conflict: that name or resource already exists.',
  },
  too_large: {
    fa: 'حجم سورس از سقف پلن ویژگی بیشتر است.',
    en: 'The source is larger than the feature bundle allows.',
  },
  rate_limited: {
    fa: 'لیارا موقتاً درخواست‌ها را محدود کرده است. کمی بعد دوباره تلاش می‌کنیم.',
    en: 'Liara is rate limiting requests. Try again shortly.',
  },
  server: {
    fa: 'خطای سمت سرور لیارا.',
    en: 'Liara server error.',
  },
  invalid_response: {
    fa: 'پاسخ لیارا با قالب مورد انتظار نمی‌خواند (احتمالاً API تغییر کرده است).',
    en: 'Liara returned an unexpected response shape (the API may have changed).',
  },
};

export function kindForStatus(status: number): LiaraErrorKind {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'bad_request';
}

export interface LiaraErrorInit {
  kind: LiaraErrorKind;
  status: number;
  /** Method + path template, e.g. `POST /v1/projects/{app}/actions/restart`. */
  endpoint: string;
  /** Liara's own `message`, if any (already redacted). */
  liaraMessage?: string;
  /** Redacted body or zod issues. */
  raw?: unknown;
}

export class LiaraError extends Error {
  readonly kind: LiaraErrorKind;
  readonly status: number;
  readonly endpoint: string;
  readonly messageFa: string;
  readonly messageEn: string;
  readonly raw: unknown;
  readonly retryable: boolean;

  constructor(init: LiaraErrorInit) {
    const base = MESSAGES[init.kind];
    const detail = init.liaraMessage ? ` (${init.liaraMessage})` : '';
    super(`${init.endpoint}: ${base.en}${detail}`);
    this.name = 'LiaraError';
    this.kind = init.kind;
    this.status = init.status;
    this.endpoint = init.endpoint;
    this.messageFa = `${base.fa}${detail}`;
    this.messageEn = `${base.en}${detail}`;
    this.raw = init.raw;
    this.retryable = ['network', 'timeout', 'rate_limited', 'server'].includes(init.kind);
  }
}

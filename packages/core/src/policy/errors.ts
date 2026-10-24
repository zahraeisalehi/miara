export type PolicyErrorKind =
  | 'unknown_tool'
  | 'invalid_args'
  | 'not_found'
  | 'not_approved'
  | 'already_approved'
  | 'used'
  | 'expired'
  | 'tampered'
  | 'wrong_confirmation'
  | 'invalid_approver'
  | 'out_of_scope';

const MESSAGES: Record<PolicyErrorKind, { fa: string; en: string }> = {
  unknown_tool: { fa: 'چنین ابزاری وجود ندارد.', en: 'No such tool.' },
  invalid_args: { fa: 'ورودی ابزار معتبر نیست.', en: 'The tool input is invalid.' },
  not_found: { fa: 'این درخواست تأیید پیدا نشد.', en: 'Approval request not found.' },
  not_approved: {
    fa: 'این کار هنوز تأیید نشده است؛ اول باید در کارت تأیید آن را بپذیرید.',
    en: 'Not approved yet; approve it on the approval card first.',
  },
  already_approved: { fa: 'این درخواست قبلاً تأیید شده است.', en: 'Already approved.' },
  used: {
    fa: 'این تأیید قبلاً استفاده شده است؛ برای تکرار، درخواست تازه بدهید.',
    en: 'This approval was already used; propose the action again.',
  },
  expired: {
    fa: 'مهلت این تأیید (۱۰ دقیقه) تمام شده است؛ درخواست تازه بدهید.',
    en: 'This approval expired (10 minutes); propose the action again.',
  },
  tampered: {
    fa: 'ورودی این کار با چیزی که تأیید شد یکی نیست؛ اجرا متوقف شد.',
    en: 'The arguments do not match what was approved; execution refused.',
  },
  wrong_confirmation: {
    fa: 'متن تأیید درست نیست. نام دقیق اپ را تایپ کنید.',
    en: 'Wrong confirmation text. Type the exact app name.',
  },
  invalid_approver: { fa: 'تأییدکننده‌ی نامعتبر.', en: 'Invalid approver.' },
  out_of_scope: {
    fa: 'این اپ خارج از محدوده‌ی میاراست؛ میارا آن را نمی‌بیند و به آن دست نمی‌زند.',
    en: "This app is outside Miara's scope (MIARA_APP_SCOPE); Miara can't see or change it.",
  },
};

export class PolicyError extends Error {
  readonly kind: PolicyErrorKind;
  readonly messageFa: string;
  readonly messageEn: string;
  readonly raw: unknown;

  constructor(kind: PolicyErrorKind, raw?: unknown) {
    super(MESSAGES[kind].en);
    this.name = 'PolicyError';
    this.kind = kind;
    this.messageFa = MESSAGES[kind].fa;
    this.messageEn = MESSAGES[kind].en;
    this.raw = raw;
  }
}

// Agent-friendly tool results: one summary line, then compact JSON (or log lines). Everything here is already
// redacted by core's gate; this module only shapes and caps it. Never a stack trace.
import { db, liara, llm, policy, tools } from '@miara/core';
import type { CallToolResult } from '@modelcontextprotocol/server';

export const MAX_LOG_LINES = 100;
export const MAX_LINE_CHARS = 500;
export const MAX_ARRAY_ITEMS = 50;

type Tier = 0 | 1 | 2 | 3;
type Approval = policy.PendingApproval;

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Caps arrays (top level and one level down) so a result never floods the agent's context. */
export function capArrays(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY_ITEMS).map((v) => capArrays(v, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? [...head, `+${value.length - MAX_ARRAY_ITEMS} more`]
      : head;
  }
  if (depth < 3 && typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, capArrays(v, depth + 1)]));
  }
  return value;
}

interface LogsLike {
  source: string;
  complete?: boolean;
  lines: { ts: number; stream: string; message: string }[];
}

function isLogs(v: unknown): v is LogsLike {
  return typeof v === 'object' && v !== null && 'lines' in v && Array.isArray(v.lines);
}

function appsSummary(result: unknown): string {
  if (!Array.isArray(result)) return 'apps';
  const items = result.map((a: Record<string, unknown>) => {
    const name = String(a.project_id ?? a.name ?? '?');
    return `${name} (${String(a.status ?? '?')}, ${String(a.planID ?? '?')}/${String(a.bundlePlanID ?? '?')})`;
  });
  return `${result.length} app${result.length === 1 ? '' : 's'}: ${items.join(', ')}`;
}

/** The first line of every successful result. */
export function summaryLine(tool: string, tier: Tier, args: unknown, result: unknown): string {
  const app =
    typeof args === 'object' && args !== null && 'app' in args ? String(args.app) : undefined;
  if (tool === 'list_apps') return appsSummary(result);
  if (isLogs(result)) {
    const shown = Math.min(result.lines.length, MAX_LOG_LINES);
    const gap =
      result.complete === false
        ? ' (busy window: older pages skipped, the newest minutes are complete)'
        : '';
    return `${shown} newest log lines (${result.source})${app ? ` for ${app}` : ''}, newest last${gap}`;
  }
  if (Array.isArray(result)) return `${tool}${app ? ` ${app}` : ''}: ${result.length} items`;
  if (tier === 0) return `${tool}${app ? ` ${app}` : ''}: ok`;
  return `${tool}${app ? ` ${app}` : ''}: done (tier ${tier}, ${tier === 1 ? 'auto' : 'approved'})`;
}

export function formatResult(
  tool: string,
  tier: Tier,
  args: unknown,
  result: unknown,
): CallToolResult {
  const head = summaryLine(tool, tier, args, result);
  if (isLogs(result)) {
    const lines = result.lines
      .slice(-MAX_LOG_LINES)
      .map(
        (l) =>
          `${new Date(l.ts).toISOString()} ${l.stream} ${truncate(l.message.replace(/\n/g, '\\n'), MAX_LINE_CHARS)}`,
      );
    return text([head, ...lines].join('\n'));
  }
  return text(`${head}\n${JSON.stringify(capArrays(result))}`);
}

const TIER_FA: Record<number, string> = {
  2: 'این کار به تأیید شما نیاز دارد.',
  3: 'این کار هزینه دارد یا برگشت‌ناپذیر است و به تأیید شما (با تایپ نام اپ) نیاز دارد.',
};

/** What the agent sees when a human still has to approve. Tells it exactly what a human does, and that it must not. */
export function formatPending(
  approval: Approval,
  note?: { fa: string; en: string },
): CallToolResult {
  const lines = [
    `pending_approval: ${approval.tool}${approval.app ? ` ${approval.app}` : ''} needs a human's approval (tier ${approval.tier}).`,
    `approvalId: ${approval.id} · expires ${approval.expiresAt.toISOString()}`,
  ];
  if (note) lines.push(note.en);
  if (approval.escalation) lines.push(`Why it needs approval: ${approval.escalation.reasonEn}`);
  if (approval.costPreview) lines.push(`Cost: ${approval.costPreview.noteEn}`);
  lines.push(`Args: ${JSON.stringify(approval.args)}`);
  lines.push(
    `How a human approves: in their own terminal, \`pnpm miara approve ${approval.id}\`` +
      (approval.tier >= 3
        ? ` (they type the app name "${approval.confirmationHint ?? approval.app ?? ''}")`
        : '') +
      `. Then call run_approved with {"approvalId":"${approval.id}"}. Never run that command yourself.`,
  );
  lines.push('');
  lines.push(`fa: ${TIER_FA[approval.tier] ?? TIER_FA[2]}${note ? ` ${note.fa}` : ''}`);
  if (approval.escalation) lines.push(`fa: ${approval.escalation.reasonFa}`);
  if (approval.costPreview) lines.push(`fa: ${approval.costPreview.noteFa}`);
  lines.push(
    `fa: برای تأیید، در ترمینال خودتان \`pnpm miara approve ${approval.id}\` را اجرا کنید؛ مهلت تا ${approval.expiresAt.toISOString()}.`,
  );
  return text(lines.join('\n'));
}

interface Explained {
  kind: string;
  messageFa: string;
  messageEn: string;
  detail?: string;
}

function explain(err: unknown): Explained | undefined {
  if (err instanceof policy.PolicyError) {
    const detail =
      err.kind === 'invalid_args' && Array.isArray(err.raw)
        ? (err.raw as { path: string; message: string }[])
            .map((i) => `${i.path || '(root)'}: ${i.message}`)
            .join('; ')
        : undefined;
    return {
      kind: `policy:${err.kind}`,
      messageFa: err.messageFa,
      messageEn: err.messageEn,
      detail,
    };
  }
  if (err instanceof liara.LiaraError) {
    return {
      kind: `liara:${err.kind}`,
      messageFa: err.messageFa,
      messageEn: err.messageEn,
      detail: `${err.endpoint} → ${err.status}`,
    };
  }
  if (err instanceof tools.ToolInputError) {
    return { kind: 'input', messageFa: err.messageFa, messageEn: err.messageEn };
  }
  if (err instanceof llm.LlmError) {
    return { kind: `llm:${err.kind}`, messageFa: err.messageFa, messageEn: err.messageEn };
  }
  if (err instanceof liara.UnknownPlanError) {
    return {
      kind: 'unknown_plan',
      messageFa: 'این پلن یا بسته در فهرست لیارا نیست. از list_plans استفاده کنید.',
      messageEn: `${err.message}. Use list_plans for valid IDs.`,
    };
  }
  // Never the raw driver error: it can carry the DATABASE_URL.
  if (db.isDbUnavailable(err)) {
    return {
      kind: 'db_unavailable',
      messageFa: db.DB_UNAVAILABLE_MESSAGE.fa,
      messageEn: db.DB_UNAVAILABLE_MESSAGE.en,
    };
  }
  if (db.isDbNotMigrated(err)) {
    return {
      kind: 'db_not_migrated',
      messageFa: db.DB_NOT_MIGRATED_MESSAGE.fa,
      messageEn: db.DB_NOT_MIGRATED_MESSAGE.en,
    };
  }
  return undefined;
}

export const GENERIC_ERROR = {
  fa: 'خطای پیش‌بینی‌نشده‌ای رخ داد. جزئیات در لاگ سرور میارا ثبت شد.',
  en: 'An unexpected error happened. Details are in the Miara server log (stderr).',
};

/** fa/en error text. Unexplained errors become a generic message; the caller logs them (redacted) to stderr. */
export function formatError(err: unknown): { result: CallToolResult; explained: boolean } {
  const e = explain(err);
  const lines = e
    ? [`error ${e.kind}: ${e.messageEn}`, ...(e.detail ? [e.detail] : []), `fa: ${e.messageFa}`]
    : [`error internal: ${GENERIC_ERROR.en}`, `fa: ${GENERIC_ERROR.fa}`];
  return { result: { ...text(lines.join('\n')), isError: true }, explained: Boolean(e) };
}

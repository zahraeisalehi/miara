// Human approval over MCP elicitation (D20). The tool call returns `inputRequired` with one elicitation; the client
// (or the SDK's legacy shim on 2025-era connections) asks the human and re-enters the handler with the answer.
// The round-trip `requestState` is HMAC-signed (createRequestStateCodec) and names the approval, the tool and the
// args hash, so a client cannot swap in another approval or other args. The human's answer still goes through
// `policy.approve`, which checks the tier-3 typed confirmation; nothing here can approve on its own.
import { randomBytes } from 'node:crypto';

import type { policy } from '@miara/core';
import {
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
} from '@modelcontextprotocol/server';
import type { InputRequiredResult, ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';

type Approval = policy.PendingApproval;

export interface ApprovalState {
  approvalId: string;
  tool: string;
  argsHash: string;
}

export const ELICITATION_KEY = 'approval';

const Tier2Answer = z.object({
  approve: z.boolean().describe('Approve this action / این کار را تأیید می‌کنید؟'),
});
const Tier3Answer = z.object({
  confirmation: z
    .string()
    .describe('Type the exact app name to approve / برای تأیید، نام دقیق اپ را تایپ کنید'),
});

/** One codec per process: stdio serves every round of a flow from the same process. */
export function createApprovalCodec(key: Uint8Array = randomBytes(32)) {
  return createRequestStateCodec<ApprovalState>({
    key,
    ttlSeconds: 10 * 60, // same as APPROVAL_TTL_MS
    bind: (ctx) => ctx.mcpReq.method,
  });
}
export type ApprovalCodec = ReturnType<typeof createApprovalCodec>;

export function elicitationMessage(a: Approval): string {
  const target = `${a.tool}${a.app ? ` (${a.app})` : ''}`;
  const parts = [
    `میارا می‌خواهد این کار را انجام دهد: ${target}`,
    `Miara wants to run: ${target}`,
    `Args: ${JSON.stringify(a.args)}`,
  ];
  if (a.escalation) parts.push(a.escalation.reasonFa, a.escalation.reasonEn);
  if (a.costPreview) parts.push(a.costPreview.noteFa, a.costPreview.noteEn);
  parts.push(
    a.tier >= 3
      ? `برای تأیید، نام اپ «${a.confirmationHint ?? a.app ?? ''}» را تایپ کنید. / To approve, type the app name.`
      : 'تأیید می‌کنید؟ / Do you approve?',
    `Expires / مهلت: ${a.expiresAt.toISOString()}`,
  );
  return parts.join('\n');
}

export async function askForApproval(
  codec: ApprovalCodec,
  approval: Approval,
  ctx: ServerContext,
): Promise<InputRequiredResult> {
  const requestState = await codec.mint(
    { approvalId: approval.id, tool: approval.tool, argsHash: approval.argsHash },
    ctx,
  );
  return inputRequired({
    inputRequests: {
      [ELICITATION_KEY]: inputRequired.elicit({
        message: elicitationMessage(approval),
        requestedSchema: approval.tier >= 3 ? Tier3Answer : Tier2Answer,
      }),
    },
    requestState,
  });
}

/** The human's answer from a re-entered call: a typed confirmation (tier 3), true (tier 2), or null (declined). */
export function readAnswer(
  tier: number,
  responses: Record<string, unknown> | undefined,
): { approved: false } | { approved: true; typedConfirmation?: string } {
  if (tier >= 3) {
    const raw = acceptedContent(responses, ELICITATION_KEY);
    const parsed = Tier3Answer.safeParse(raw);
    return parsed.success && parsed.data.confirmation.trim()
      ? { approved: true, typedConfirmation: parsed.data.confirmation }
      : { approved: false };
  }
  const parsed = Tier2Answer.safeParse(acceptedContent(responses, ELICITATION_KEY));
  return parsed.success && parsed.data.approve ? { approved: true } : { approved: false };
}

export function supportsElicitation(capabilities: { elicitation?: unknown } | undefined): boolean {
  return Boolean(capabilities?.elicitation);
}

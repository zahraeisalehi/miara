// `pnpm miara approvals` / `pnpm miara approve <id>`: the human's terminal fallback for MCP approvals (D20).
// It approves only; execution stays on one path (the agent calls `run_approved`). It refuses to run without a
// TTY on both stdin and stdout, so a coding agent's shell tool cannot approve for itself (plus a deny rule in
// .claude/settings.json and the server instructions).
import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { createMiaraCore, db, policy } from '@miara/core';

import { EnvError, loadCoreConfig } from './env.js';

type Gate = policy.PolicyGate;
type Approval = policy.PendingApproval;

export interface CliIo {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function describe(a: Approval): string[] {
  const lines = [
    `  id       ${a.id}`,
    `  action   ${a.tool}${a.app ? ` on ${a.app}` : ''} (tier ${a.tier})`,
    `  args     ${JSON.stringify(a.args)}`,
    `  expires  ${a.expiresAt.toISOString()}`,
  ];
  if (a.escalation)
    lines.push(`  why      ${a.escalation.reasonEn}`, `           ${a.escalation.reasonFa}`);
  if (a.costPreview) {
    const c = a.costPreview;
    lines.push(
      `  cost     ${fmt(c.next.monthlyWithVat)} toman/month incl. VAT` +
        (c.deltaMonthlyWithVat !== undefined
          ? ` (change ${c.deltaMonthlyWithVat >= 0 ? '+' : ''}${fmt(c.deltaMonthlyWithVat)})`
          : ''),
      `           ${c.noteFa}`,
    );
  }
  return lines;
}

const USAGE = [
  'Usage:',
  '  pnpm miara approvals        list pending approvals',
  '  pnpm miara approve <id>     approve one (y/N; tier 3: type the app name)',
].join('\n');

export async function runCli(argv: string[], gate: Gate, io: CliIo): Promise<number> {
  const out = (s: string) => io.stdout.write(`${s}\n`);
  const err = (s: string) => io.stderr.write(`${s}\n`);
  const [command, id] = argv;

  if (command === 'approvals') {
    const pending = await gate.listPending();
    if (pending.length === 0) {
      out('No pending approvals. / درخواست تأییدی در انتظار نیست.');
      return 0;
    }
    out(`${pending.length} pending approval(s):`);
    for (const a of pending) {
      out('');
      for (const line of describe(a)) out(line);
    }
    return 0;
  }

  if (command === 'approve' && id) {
    if (!io.isTTY) {
      err(
        'Refused: `pnpm miara approve` must be run by a human in an interactive terminal.\n' +
          'رد شد: این فرمان را خودتان در ترمینال اجرا کنید.',
      );
      return 2;
    }
    const a = await gate.getApproval(id);
    if (!a) {
      err('Approval not found. / درخواست تأیید پیدا نشد.');
      return 1;
    }
    out('Approve this action? / این کار را تأیید می‌کنید؟');
    for (const line of describe(a)) out(line);
    const rl = createInterface({ input: io.stdin, output: io.stdout, terminal: false });
    try {
      let typedConfirmation: string | undefined;
      if (a.tier >= 3) {
        typedConfirmation = await rl.question(
          `Type the app name "${a.confirmationHint ?? a.app ?? ''}" to approve (anything else cancels): `,
        );
      } else {
        const answer = await rl.question('Approve? [y/N] ');
        if (!/^y(es)?$/i.test(answer.trim())) {
          out('Not approved; it stays pending until it expires. / تأیید نشد.');
          return 1;
        }
      }
      await gate.approve(a.id, {
        approver: 'cli-user',
        ...(typedConfirmation !== undefined ? { typedConfirmation } : {}),
      });
      out(
        `Approved. Now tell your coding agent to call run_approved with {"approvalId":"${a.id}"}.\n` +
          'تأیید شد. حالا از عامل کدنویسی بخواهید run_approved را صدا بزند.',
      );
      return 0;
    } catch (e) {
      if (e instanceof policy.PolicyError) {
        err(`${e.messageEn}\n${e.messageFa}`);
        return 1;
      }
      throw e;
    } finally {
      rl.close();
    }
  }

  err(USAGE);
  return 64;
}

async function main() {
  let loaded;
  try {
    loaded = loadCoreConfig();
  } catch (e) {
    process.stderr.write(`${e instanceof EnvError ? e.message : 'Could not load the config.'}\n`);
    process.exit(1);
  }
  const core = createMiaraCore(loaded.config);
  try {
    const code = await runCli(process.argv.slice(2), core.policy, {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    });
    process.exitCode = code;
  } catch (e) {
    const problem = db.dbProblemMessage(e);
    if (!problem) throw e;
    process.stderr.write(`${problem.en}\n${problem.fa}\n`);
    process.exitCode = 1;
  } finally {
    await core.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

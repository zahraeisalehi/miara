# Demo story: "Sara ships her shop"

The judges follow a person, not a dashboard. Every step shows one scoring criterion.
Sara approves exactly **two** things in the happy path: creating the app and upgrading the plan. Everything else Miara
does by itself, and every step is visible on the timeline (D19).

1. **Ship it.** Sara (a junior dev) finished a small Node shop with Claude Code. She says "put this online".
   Miara detects Node, explains *why* the plan and the standard bundle fit (D18; basic is offered as cheaper, with its
   caveats), shows the hourly and monthly cost with VAT and how many days her credit covers, and asks to create the
   app (tier 3: she types the app name, **approval 1**). It deploys, streams the build, probes the URL, and warns her that
   the `liara.run` address lasts 7 days and offers domain setup. → *Liara integration, UX*
2. **Domain.** Miara does the API parts itself (zone, add domain, SSL: tier 1, automatic) and gives Sara only the
   IRNIC/registrar steps she must do herself, plus a "check now" button. → *setup made easy, API limits communicated*
3. **Trouble.** Traffic arrives; the `/report` fault leaks memory. The worker opens an incident: RAM at 95%, OOM restarts, 5xx up. → *monitoring*
4. **Diagnosis.** Miara explains in plain Persian: likely a memory leak in `/report` (high confidence, with the
   evidence listed). Second guess: the plan is too small. It **restarts the app automatically** (tier 1, quick relief,
   behind the circuit breaker), shows an approval card to upgrade the plan (tier 3, cost delta shown, **approval 2**),
   and marks the bug as sent to her coding agent. → *intelligence, clarity, approvals*
5. **Handoff.** Claude Code pulls the incident over MCP (`get_open_incidents`, prompt `fix_miara_incident`), fixes the
   leak, runs the tests, redeploys with `deploy_project` (tier 1), and calls `report_fix`.
6. **Verify.** Miara re-checks the new release: RAM is stable, no 5xx, probe green → the incident is closed with a short
   report. If it isn't fixed, the incident reopens with the new evidence. → *evaluating outcomes*

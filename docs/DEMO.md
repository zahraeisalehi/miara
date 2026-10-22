# Demo story: "Sara ships her shop"

The judges follow a person, not a dashboard. Every step shows one scoring criterion.

1. **Ship it.** Sara (a junior dev) finished a small Node shop with Claude Code. She says "put this online".
   Miara detects Node, explains *why* the Mars/base plan fits, shows the hourly and monthly cost, and asks to create
   the app (tier 3 card). It deploys, streams the build, probes the URL, and warns her that the `liara.run` address lasts 7 days and offers domain setup. → *Liara integration, UX*
2. **Domain.** Miara does the API parts itself (add domain, SSL) and gives Sara only the IRNIC/registrar steps she
   must do herself, plus how to check them. → *setup made easy, API limits communicated*
3. **Trouble.** Traffic arrives; the `/report` fault leaks memory. The worker opens an incident: RAM at 95%, OOM restarts, 5xx up. → *monitoring*
4. **Diagnosis.** Miara explains in plain Persian: likely a memory leak in `/report` (high confidence, with the
   evidence listed). Second guess: the plan is too small. It offers (a) restart now, a quick relief (tier 2), (b) upgrade the plan (tier 3, cost shown),
   (c) send the bug to her coding agent. → *intelligence, clarity, approvals*
5. **Handoff.** Sara approves the restart and the handoff. Claude Code pulls the incident over MCP, fixes the leak, and redeploys.
6. **Verify.** Miara re-checks: RAM is stable, no 5xx, probe green → the incident is closed with a short report. → *evaluating outcomes*

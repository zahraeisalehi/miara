# Challenge brief (source of truth for scope and scoring)

Build an AI agent that handles publish, deployment, performance monitoring, and bug tracking for a website on
**Liara** (liara.ir). Imagine a programmer who built an app but has no knowledge of deployment: the agent guides
them through the entire workflow.

## A) Initial setup & deployment
1. Guide the user in selecting the deployment method and the initial website setup.
2. Assess project requirements; recommend infrastructure and Liara plans based on project type and resource needs.
3. Assist with initial setup, configuration, and deployment.
4. Guide domain configuration, including steps at the registrar (e.g. IRNIC) if applicable.
5. Make setup easy: the user handles only the essential tasks the assistant cannot do.

## B) Deployment & infrastructure operations
1. Publish new versions.
2. Execute or guide configuration and service management via the Liara API: create apps/databases, deploy custom
   Docker images, CI/CD, start/stop apps and DBs, check credit balance, monitor resource usage, create backups.
3. Monitor service status; identify errors during deployment.
4. Automate repetitive tasks.

## C) Monitoring & maintenance (act as an SRE that reads reports and takes actions)
1. Service health and resources (CPU/RAM) where data is accessible.
2. Retrieve and analyze logs.
3. Investigate slowdowns, disruptions, and resource spikes.
4. Recommend performance and stability improvements.
5. Perform corrective actions or guide troubleshooting.

## D) Intelligent troubleshooting (e.g. HTTP 500)
1. Gather error information from available sources.
2. Examine logs, service status, and resource data.
3. Identify and **prioritize** potential causes.
4. Propose a solution.
5. If authorized, implement the fix and **verify the outcome**.

Example: if the site is slow, decide whether the likely cause is RAM, CPU, app errors, or something else, then
(1) suggest a solution, (2) get human approval, (3) act, (4) bonus: communicate bugs and fixes to the developer's
coding agent via an MCP server.

## Human-in-the-loop (like Claude Code)
- Sensitive operations (high-risk config changes, restarts, plan/resource changes) require user confirmation.
- Distinguish low-risk auto-executable operations from sensitive ones.
- The outcome and any errors of every operation must be visible to the user.

## Constraints
- Use Liara's **actual** API capabilities. If something isn't possible via the API, tell the user clearly.
- Freedom in architecture, UI (custom UI, chat, CLI…), and approach (agents, MCP, or both).

## UX (key criterion)
The user must be able to: state requirements with minimal technical knowledge; understand the status of ongoing
operations; evaluate suggestions; authorize operations when needed. Turn complex infra into a simple, intuitive,
reliable experience.

## Deliverable
A working MVP for a specific phase of the lifecycle, demonstrated with a **real-world scenario** that runs from a
user request to execution or diagnosis.

## Scoring
| Criterion | Aspects | Points |
|---|---|---|
| Technical performance & Liara integration | API connection, setup/deploy, service mgmt, successful infra ops | 100 |
| Intelligence & problem solving | log analysis, error detection, root causes, proposed solutions, evaluating fix outcomes | 100 |
| UX | ease of interaction, clarity of suggestions, operation status, confirmation handling | 50 |
| Stability, maintenance, operational security | resource/health monitoring, automating repetitive tasks, secure sensitive actions, communicating API limitations | 50 |

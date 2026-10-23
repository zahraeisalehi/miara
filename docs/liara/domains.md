# Domains, DNS, SSL (Miara's "domain setup" workflow)

Two paths. Miara explains both and recommends A for non-technical users.

## A) Liara DNS (Miara does almost everything)
1. Miara: create a DNS zone for `example.ir` (DNS API, `dns-service.liara.ir`). The zone gets Liara nameservers.
2. **User (only manual step):** at the registrar (IRNIC for `.ir`, or wherever the domain was bought), replace the
   nameservers with the ones Miara shows. The API can't do this; say so.
3. Miara: poll the check-nameserver endpoint. Zone status goes `CREATING → PENDING → ACTIVE`. Propagation can take hours;
   show that it is waiting, not failing.
4. Miara: create records, add the domain to the app (PaaS domains: create + attach), enable SSL, and probe `https://example.ir`.

## B) Keep the current DNS provider
Miara adds the domain to the app and shows the exact record(s) the user must create at their provider. Get the
expected record values from the PaaS domain "check" response, not from memory. Then poll check, enable SSL, and probe.

## Record format (DNS API)
`{ "name": "@" | "www" | "*", "type": "A|AAAA|CNAME|MX|TXT|SRV|SPF|PTR|ALIAS", "ttl": 3600, "contents": [...] }`
- A: `contents: [{ "ip": "1.2.3.4" }]` · CNAME: `[{ "host": "example.com" }]` · MX: `[{ "priority": 10, "host": "mail.example.com" }]`
- ALIAS works at the root (where CNAME can't). Record *type* can't be edited; delete and recreate instead.

## Risk tiers
Create zone/record, add domain, enable SSL = **tier 1** (routine, automatic and visible on the timeline, per D19).
Delete zone/record/domain, disable SSL = tier 3.
Remind the user: `<app>.liara.run` expires 7 days after the first deploy, so finishing this flow is what keeps the site up.

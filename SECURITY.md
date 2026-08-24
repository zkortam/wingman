# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's
[private vulnerability reporting](https://github.com/zkortam/wingman/security/advisories/new)
form and include affected versions, impact, reproduction steps, and any suggested
mitigation. Do not include real customer data or credentials.

Maintainers will acknowledge a complete report as soon as practical, investigate it
privately, and coordinate disclosure after a fix is available. Please avoid public
disclosure while remediation is in progress.

## Supported versions

Until 1.0, only the latest release and the current `main` branch receive security
fixes. Deployments must use HTTPS, separate operator/SDK/replay/service credentials,
deny browser access to service-role keys, and apply every Supabase migration in order.

Wingman is a decision-review layer, not a sandbox. Hosts remain responsible for tool
authorization, least privilege, human approval for destructive actions, and ensuring
that replay callbacks cannot execute tools.

# Security Policy

Security is a core concern for DrawBase because it handles database metadata, temporary connection credentials and generated SQL.

## Supported versions

DrawBase is currently pre-release software. Security fixes are applied to the `main` branch and to the latest published release, when one exists. Older commits and development snapshots are not supported.

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, connection strings or private schema data in a public issue.

Use GitHub's private vulnerability reporting form at:

https://github.com/brenoalcantara/drawbase/security/advisories/new

If the private form is unavailable, open a public issue containing only a request for a private security contact. Do not include technical details until a private channel has been established.

Include, when possible:

- the affected version or commit;
- the affected component and configuration;
- impact and prerequisites;
- minimal reproduction steps using test data;
- possible mitigations or fixes;
- whether the issue is already public or under active exploitation.

You should receive an initial acknowledgement within seven days. Status updates will be provided at least every fourteen days while the report is being investigated. Release timing depends on severity, fix complexity and coordinated disclosure needs.

## Security expectations

- Never use production credentials in examples, tests or reports.
- Rotate any credential that may have been exposed; deleting it from Git history is not sufficient.
- Keep SQL execution disabled unless using isolated local test targets.
- Keep network introspection blocked unless an explicit host allowlist is configured.
- Treat imported schemas and generated SQL as sensitive data.

Good-faith research that avoids privacy violations, data destruction, service disruption and access beyond what is necessary to demonstrate the issue is welcome.

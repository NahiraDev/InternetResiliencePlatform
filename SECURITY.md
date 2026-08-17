# Security Policy

## Supported versions

The project is pre-release during the current development phases. Security fixes target the default branch until versioned release lines are published.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities through public GitHub issues, pull requests, discussions, or comments.

Use GitHub private vulnerability reporting / Security Advisories when available. If private reporting is unavailable, contact the maintainers through the project's published private security contact channel.

Include, where safe:

- Affected component, endpoint, package, workflow, or configuration.
- Reproduction steps or proof of concept.
- Security impact and realistic attack surface.
- Relevant version, commit, or environment information.
- Suggested mitigation, if known.

Never include passwords, API keys, GitHub installation tokens, JWT secrets, private keys, or other credentials in reports.

## Response and disclosure

Maintainers will acknowledge reports, triage severity, reproduce the issue, and coordinate remediation. Public disclosure should wait until a fix or mitigation is available and release coordination is complete.

## Supply-chain and CI security

Security-sensitive changes should preserve least-privilege GitHub Actions permissions, dependency review checks, signed container artifacts, and repository validation gates. Changes that weaken these controls require explicit maintainer review.

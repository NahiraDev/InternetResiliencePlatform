# Documentation Standards

IRP documentation is product infrastructure. It must be accurate, discoverable, maintainable, and tied to the implementation.

## Content types

Use the smallest useful document type:

| Type | Purpose |
| --- | --- |
| Quickstart | Get a new user from zero to first successful run |
| Concept | Explain what something is and why it exists |
| Architecture | Explain structure, boundaries, data/control flow, and failure behavior |
| How-to | Complete a specific task |
| Reference | Look up exact contracts, configuration, commands, or schemas |
| Troubleshooting | Diagnose and resolve a known class of failure |
| Operations | Deploy, monitor, recover, and maintain the system |
| ADR | Record a durable architectural decision |
| History | Preserve implementation history without defining current behavior |

## Canonical-source rule

One fact should have one canonical home. Other documents should link to it rather than copy it.

## Implementation truth

Documentation must distinguish:

- implemented and verified;
- implemented but integration verification pending;
- experimental;
- planned.

Never turn an interface, type, placeholder, mock, or phase requirement into a claim of production capability.

## Required architecture coverage

Subsystem architecture should explain, where applicable:

1. purpose and scope;
2. responsibilities;
3. dependencies;
4. data flow;
5. control flow;
6. state and lifecycle;
7. failure modes;
8. security boundaries;
9. configuration;
10. observability;
11. testing and verification;
12. operational behavior;
13. implementation references;
14. known limitations.

## Writing rules

- Put the most important information first.
- Use descriptive headings.
- Prefer short paragraphs, lists, tables, and diagrams for complex systems.
- Use consistent project terminology.
- Avoid unexplained historical context in user-facing guides.
- Avoid speculative claims.
- Keep examples executable where practical.
- Use relative links within the repository.

## Change discipline

A behavior or contract change should update implementation, tests, and canonical documentation as one change set. Retire or merge documents when their information is superseded.

## Historical material

Phase reports and audit evidence belong under `docs/phases/`. They provide traceability but must not be required to understand or use the current product.

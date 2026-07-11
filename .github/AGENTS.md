# GuardianDNS AI Engineering Agent Contract

You are an implementation engineer.

Rules:
1. GitHub Issues are the single source of truth.
2. Never start coding without selecting an open issue.
3. At startup:
   - Read repository documentation.
   - Check open Sprint issues.
   - Select the highest priority unassigned issue.
4. Before coding:
   - Comment on the issue with implementation plan.
   - Create branch:
     feature/issue-{number}-{short-name}
5. After implementation:
   - Run tests.
   - Create Pull Request.
   - Link PR to issue.
6. Never modify architecture without updating documentation.
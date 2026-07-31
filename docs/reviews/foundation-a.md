# Foundation A Review

Review target: UCF-RS Foundation A combined diff covering A1 through A4.

Feature objective:

- A1: storage schemas, authority/projection boundaries, canonical hash boundaries, schema compatibility, offline queue/archive classification, and UCF-Yjs conformance matrix.
- A2: data handling policy and diagnostic redaction boundary.
- A3: local HTTP guardrails.
- A4: CI matrix and initialized strict-status fixture.

Relevant invariants:

- Do not change canonical hashes.
- Do not infer evidence from surrounding context, symbol names, AST identity, or fuzzy matches.
- Do not add source-persisted citations by default.
- Keep UCF-RS independent from UCF-Yjs.
- Do not add remote authentication or TLS.

Verification supplied:

- Focused HTTP tests: 4 passed.
- Full UCF-RS suite: 38 passed twice.
- Compile check: passed.
- CLI help: passed.
- Temporary initialized `status --strict` fixture: passed.
- `git diff --check`: passed with line-ending conversion warnings only.

Findings:

- `[P2] README validation command is not valid in PowerShell`: fixed by replacing the literal wildcard compile command with the cross-shell Python compile command used by CI.
- `[P2] CI status check does not validate an initialized fixture`: fixed by adding `scripts/ci_status_fixture.py`, which creates a temporary initialized managed-edit fixture, activates a citation, and runs `status --strict`.

Accepted review result:

- No unresolved findings.
- Foundation A is review-ready and may be used as the frozen baseline for Foundation B.

# Implementation-Readiness Revision Summary

## Codex plan

- Split UCF-RS hardening into Foundation A (guardrails/contracts/CI) and
  Foundation B (recoverable consistency).
- Recast UCF-RS as an independent behavioral baseline and conformance oracle.
- Prohibited UCF-Yjs dependencies on UCF-RS code, runtime, JSONL layouts,
  transaction formats, storage schemas, and hashes.
- Removed all M1 scaffold and package deliverables from the initial Codex task.
- Made M1 contingent on explicit post-M0 approval.
- Added actor-neutral checkpoint identity requirements.
- Added privacy/publication policy dimensions beyond retention.

## UCF-Yjs TRD

- Clarified authority-plane ownership and UCF-RS independence.
- Split UCF-RS foundation milestone into M-1A and M-1B.
- Replaced checkpoint `agent_view_digest` identity input with
  `accepted_projection_digest`.
- Made capability-filtered views non-identity outputs.
- Added optional canonical full-view verification metadata outside checkpoint
  identity.
- Expanded security/data handling into retention, visibility, exportability,
  disclosure, redaction, checkpoint sharing, and provider backups.
- Added an explicit implementation-readiness gate before M1.

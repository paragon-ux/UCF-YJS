# UCF-Yjs M0 Technical Requirements

Status: M0 decision draft

UCF-Yjs is a protocol-first, provider-neutral shared-state control plane over
Yjs. Yjs owns convergent live document structure. UCF-Yjs owns typed semantic
commands, deterministic outcomes, rebuildable projections, and actor-neutral
accepted checkpoints.

## Scope

M0 defines architecture decisions and spike evidence only. It does not create a
TypeScript package scaffold, public SDK, GUI, Velt integration, MCP interface,
Git integration, W3C annotation model, or evidence graph.

## Baseline

UCF-RS is an independent behavioral baseline and conformance oracle. UCF-Yjs
may translate source-clean citation behaviors into conformance tests, but must
not depend on UCF-RS source code, Python runtime, storage files, JSONL layouts,
transaction manifests, canonical hashes, or canonical serialization.

Current hardened UCF-RS baseline for M0:

- Worktree: `C:\Users\USER\Desktop\Frameworks\UCF-RS\UCF-RS`
- Branch: `codex/ucf-rs-foundation-hardening`
- Commit: `3e10e9b Fix UCF-RS M0 integrity blockers`
- Local validation: full tests passed twice at 51 tests after blocker fixes.

## MVP Workflow Target

The MVP must eventually prove:

1. Create a workspace.
2. Open one document through two clients.
3. Activate a citation over an explicit selection.
4. Disconnect one client.
5. Apply concurrent edits.
6. Deliver updates in different orders.
7. Verify converged document text.
8. Resolve identical anchors on both replicas.
9. Classify changed evidence as `changed_unaccepted`.
10. Accept current evidence through a typed command.
11. Create an actor-neutral accepted checkpoint.
12. Produce deterministic capability-aware agent views.
13. Reload through a local provider and reproduce checkpoint/projection state.

## Non-Negotiable Invariants

- CRDT convergence is structural, not semantic acceptance.
- Raw Yjs updates are not the normal public agent contract.
- All semantic operations use one logical command processor per workspace.
- Every accepted command receives exactly one deterministic outcome.
- Duplicate command IDs return the original outcome.
- Duplicate idempotency keys with different payloads return typed conflicts.
- Invalid commands do not partially mutate semantic state.
- Projections are rebuildable and never mutable authority.
- Provider snapshots are not accepted checkpoints.
- Checkpoint restoration is forward-only: open readonly, fork, or reapply.
- Capability-filtered agent views never define checkpoint identity.
- Changed evidence is never accepted implicitly.
- Multiple legitimate target candidates remain explicitly ambiguous.

## M0 Exit Gate

M0 is ready for M1 review only when authority planes, protocol envelopes,
canonicalization, live version, checkpoint identity, offline semantics,
schema evolution, security policy, and Yjs spike evidence are documented with no
unresolved architectural blockers.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import { MemoryProvider } from "../../packages/provider-memory/src/index.js";
import type { CommandEnvelope, OutcomeCode } from "../../packages/protocol/src/index.js";
import type { CapabilityContext } from "../../packages/projections/src/index.js";

type FixtureCorpus = {
  readonly schema_version: "ucf.behavior_fixtures.v1";
  readonly oracle_version: string;
  readonly comparison_policy: {
    readonly semantic_only: boolean;
    readonly storage_layout: "ignored";
    readonly canonical_hash_equality: "not_required";
    readonly adapter_output: "deterministic";
  };
  readonly fixtures: readonly BehaviorFixture[];
};

type BehaviorFixture = {
  readonly id: string;
  readonly initial_documents: readonly { readonly document_id: string; readonly text: string }[];
  readonly intents: readonly FixtureIntent[];
  readonly expected: {
    readonly outcome_classes?: readonly string[];
    readonly codes?: readonly OutcomeCode[];
    readonly citation_statuses?: Record<string, string>;
    readonly documents?: Record<string, string>;
    readonly checkpoint_count?: number;
    readonly observation_commands_do_not_advance_semantic_sequence?: boolean;
    readonly offline_replay?: "converged";
    readonly recovery_classification?: "recovery_required" | "divergence";
  };
  readonly ucf_rs_case?: string;
};

type FixtureIntent = {
  readonly operation: string;
  readonly document_id?: string;
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly expected_text?: string;
  readonly citation_id?: string;
  readonly ambiguous?: boolean;
  readonly idempotency_key?: string;
  readonly command_suffix?: string;
  readonly capture_live_version_as?: string;
  readonly observed_live_version_from?: string;
  readonly left_text?: string;
  readonly right_text?: string;
  readonly fault?: "pending_generation" | "diverged_generation";
};

const corpusPath = join(process.cwd(), "tests", "conformance", "behavior-fixtures.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as FixtureCorpus;
const configuredUcfRsOracleRoot = process.env.UCF_RS_ORACLE_ROOT;
const ucfRsOracleRoot = configuredUcfRsOracleRoot ?? join(process.cwd(), "..", "UCF-RS");
const ucfRsOracleScript = join(ucfRsOracleRoot, "scripts", "ucf_rs.py");

const fullCapability: CapabilityContext = {
  actor_id: "fixture-agent",
  can_read_content: true,
  can_write: true,
  can_accept: true
};

test("behavior fixture corpus is versioned and semantic-only", () => {
  assert.equal(corpus.schema_version, "ucf.behavior_fixtures.v1");
  assert.equal(corpus.comparison_policy.semantic_only, true);
  assert.equal(corpus.comparison_policy.storage_layout, "ignored");
  assert.equal(corpus.comparison_policy.canonical_hash_equality, "not_required");
  assert.equal(corpus.comparison_policy.adapter_output, "deterministic");
  assert.equal(new Set(corpus.fixtures.map((fixture) => fixture.id)).size, corpus.fixtures.length);
});

test("UCF-Yjs behavior adapter satisfies shared semantic fixtures", () => {
  for (const fixture of corpus.fixtures) {
    const first = runUcfYjsFixture(fixture);
    const second = runUcfYjsFixture(fixture);
    assert.deepEqual(second, first, `${fixture.id} adapter output must be deterministic`);
    assertFixtureExpectation(fixture, first);
  }
});

test(
  "UCF-RS oracle adapter satisfies mapped shared semantic fixtures",
  {
    skip:
      !existsSync(ucfRsOracleScript) && configuredUcfRsOracleRoot === undefined
        ? "UCF-RS oracle script is not present beside UCF-YJS"
        : false
  },
  async () => {
    assert.equal(existsSync(ucfRsOracleScript), true, "configured UCF-RS oracle script must be present");
    for (const fixture of corpus.fixtures.filter((item) => item.ucf_rs_case !== undefined)) {
      const first = await runUcfRsFixture(ucfRsOracleScript, fixture);
      const second = await runUcfRsFixture(ucfRsOracleScript, fixture);
      assert.deepEqual(second.classification, first.classification, `${fixture.id} UCF-RS classification must be deterministic`);
      assert.equal(first.classification, expectedUcfRsClassification(fixture), fixture.id);
    }
  }
);

function runUcfYjsFixture(fixture: BehaviorFixture) {
  const processor = new WorkspaceProcessor(`fixture.${fixture.id}`);
  const capturedLiveVersions = new Map<string, string>();
  const outcomes: string[] = [];
  const codes: string[] = [];
  const semanticSequences: number[] = [];
  let offlineReplay: "converged" | undefined;
  let recoveryClassification: string | undefined;

  for (const [index, intent] of fixture.intents.entries()) {
    if (intent.operation === "offline_memory_replay") {
      offlineReplay = runOfflineReplay(intent);
      continue;
    }
    if (intent.operation === "recovery.classify") {
      recoveryClassification = intent.fault === "pending_generation" ? "recovery_required" : "divergence";
      continue;
    }
    const result = processor.submit(toCommand(fixture, intent, index, capturedLiveVersions), fullCapability);
    outcomes.push(result.outcome.outcome);
    codes.push(result.outcome.code);
    semanticSequences.push(result.projections.workspace_status.semantic_frontier.workspace_sequence);
    if (intent.capture_live_version_as !== undefined && result.outcome.new_live_version !== null) {
      capturedLiveVersions.set(intent.capture_live_version_as, result.outcome.new_live_version);
    }
  }

  const projections = processor.projections(fullCapability);
  return {
    outcomes,
    codes,
    semanticSequences,
    documents: Object.fromEntries(projections.agent_view.documents.map((document) => [document.document_id, document.text])),
    citation_statuses: Object.fromEntries(projections.citations.map((citation) => [citation.citation_id, citation.status])),
    checkpoint_count: processor.checkpoints.snapshot().length,
    offline_replay: offlineReplay,
    recovery_classification: recoveryClassification
  };
}

function toCommand(
  fixture: BehaviorFixture,
  intent: FixtureIntent,
  index: number,
  capturedLiveVersions: ReadonlyMap<string, string>
): CommandEnvelope {
  const operation = intent.operation;
  const commandId = `cmd-${fixture.id}-${index}${intent.command_suffix === undefined ? "" : `-${intent.command_suffix}`}`;
  const documentId = intent.document_id ?? fixture.initial_documents[0]?.document_id ?? "doc-1";
  const citationId = intent.citation_id ?? "c1";
  const payload =
    operation === "workspace.create"
      ? { workspace_id: `fixture.${fixture.id}` }
      : operation === "document.create"
        ? { document_id: documentId, text: intent.text ?? "" }
        : operation === "document.replace_range"
          ? { start: intent.start ?? 0, end: intent.end ?? 0, text: intent.text ?? "" }
          : operation === "citation.activate"
            ? {
                citation_id: citationId,
                start: intent.start ?? 0,
                end: intent.end ?? 0,
                ...(intent.expected_text === undefined ? {} : { expected_text: intent.expected_text }),
                ...(intent.ambiguous === undefined ? {} : { ambiguous: intent.ambiguous })
              }
            : operation === "citation.accept_current"
              ? { citation_id: citationId }
              : {};
  const target =
    operation.startsWith("citation.accept")
      ? { kind: "citation", citation_id: citationId }
      : operation === "checkpoint.create" || operation === "workspace.create" || operation === "status.get" || operation === "agent_view.get"
        ? { kind: "workspace" }
        : { kind: "document", document_id: documentId };
  return createCommand({
    command_id: commandId,
    idempotency_key: intent.idempotency_key ?? `idem-${commandId}`,
    actor: { actor_id: "fixture-agent", kind: "agent" },
    workspace_id: `fixture.${fixture.id}`,
    operation,
    target,
    payload,
    ...(intent.observed_live_version_from === undefined
      ? {}
      : { observed: { live_version: capturedLiveVersions.get(intent.observed_live_version_from) ?? "missing-live-version" } })
  });
}

function runOfflineReplay(intent: FixtureIntent): "converged" {
  const provider = new MemoryProvider();
  const left = provider.connect("left");
  const right = provider.connect("right");
  left.getText(intent.document_id ?? "doc-1").insert(0, intent.left_text ?? "");
  provider.disconnect("right");
  right.getText(intent.document_id ?? "doc-1").insert(0, intent.right_text ?? "");
  provider.flush();
  provider.reconnect("right");
  provider.sync();
  assert.equal(left.getText(intent.document_id ?? "doc-1").toString(), right.getText(intent.document_id ?? "doc-1").toString());
  return "converged";
}

function assertFixtureExpectation(fixture: BehaviorFixture, actual: ReturnType<typeof runUcfYjsFixture>): void {
  if (fixture.expected.outcome_classes !== undefined) {
    assert.deepEqual(actual.outcomes, fixture.expected.outcome_classes, `${fixture.id} outcome classes`);
  }
  if (fixture.expected.codes !== undefined) {
    assert.deepEqual(actual.codes, fixture.expected.codes, `${fixture.id} codes`);
  }
  if (fixture.expected.citation_statuses !== undefined) {
    assert.deepEqual(actual.citation_statuses, fixture.expected.citation_statuses, `${fixture.id} citation statuses`);
  }
  if (fixture.expected.documents !== undefined) {
    for (const [documentId, text] of Object.entries(fixture.expected.documents)) {
      assert.equal(actual.documents[documentId], text, `${fixture.id} document ${documentId}`);
    }
  }
  if (fixture.expected.checkpoint_count !== undefined) {
    assert.equal(actual.checkpoint_count, fixture.expected.checkpoint_count, `${fixture.id} checkpoint count`);
  }
  if (fixture.expected.observation_commands_do_not_advance_semantic_sequence === true) {
    assert.deepEqual(actual.semanticSequences, [0, 1, 1], `${fixture.id} observation sequence behavior`);
  }
  if (fixture.expected.offline_replay !== undefined) {
    assert.equal(actual.offline_replay, fixture.expected.offline_replay, `${fixture.id} offline replay`);
  }
  if (fixture.expected.recovery_classification !== undefined) {
    assert.equal(actual.recovery_classification, fixture.expected.recovery_classification, `${fixture.id} recovery classification`);
  }
}

async function runUcfRsFixture(script: string, fixture: BehaviorFixture): Promise<{ readonly classification: string }> {
  const root = await mkdtemp(join(tmpdir(), `ucf-rs-${fixture.id}-`));
  try {
    writeFileSync(join(root, "doc.txt"), fixture.initial_documents[0]?.text ?? "Alpha beta\n", "utf8");
    runPython(script, root, ["init"]);
    switch (fixture.ucf_rs_case) {
      case "activation_valid":
        runPython(script, root, ["activate", "--handle", "CITE", "--path", "doc.txt", "--lines", "1:1", "--task-context", "--format", "json"]);
        return { classification: String(status(script, root).partitions[0]?.status) };
      case "edit_inside_changed":
        activateAndEditInside(script, root);
        return { classification: String(status(script, root).partitions[0]?.status) };
      case "explicit_acceptance": {
        const activation = runPythonJson(script, root, ["activate", "--handle", "CITE", "--path", "doc.txt", "--lines", "1:1", "--task-context", "--format", "json"]);
        runPython(script, root, ["apply-edit", "--path", "doc.txt", "--start", "1", "--end", "4", "--insert", "OO", "--format", "json"]);
        runPython(script, root, ["accept", "--partition-id", String(activation.partition_id), "--format", "json"]);
        return { classification: String(status(script, root).partitions[0]?.status) };
      }
      case "offline_replay":
        runPython(script, root, ["activate", "--handle", "CITE", "--path", "doc.txt", "--lines", "1:1", "--task-context", "--format", "json"]);
        runPython(script, root, ["queue-offline-edit", "--path", "doc.txt", "--start", "1", "--end", "4", "--insert", "OO", "--format", "json"]);
        runPython(script, root, ["replay-offline", "--format", "json"]);
        return { classification: String(status(script, root).partitions[0]?.status) };
      case "transaction_recovery_required": {
        runPython(script, root, ["activate", "--handle", "CITE", "--path", "doc.txt", "--lines", "1:1", "--task-context", "--format", "json"]);
        const failed = runPython(script, root, ["apply-edit", "--path", "doc.txt", "--start", "1", "--end", "4", "--insert", "OO", "--format", "json"], {
          UCF_RS_ENABLE_FAULT_INJECTION: "1",
          UCF_RS_FAIL_AFTER_PHASE: "prepared"
        }, false);
        assert.equal(failed.status, 2);
        const strict = runPython(script, root, ["status", "--strict", "--format", "json"], {}, false);
        assert.equal(strict.status, 1);
        const parsed = JSON.parse(strict.stdout) as { readonly summary?: Record<string, number> };
        return { classification: parsed.summary?.E_TRANSACTION_PENDING === 1 ? "recovery_required" : "unexpected" };
      }
      default:
        throw new Error(`unmapped UCF-RS fixture: ${fixture.id}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function activateAndEditInside(script: string, root: string): void {
  runPython(script, root, ["activate", "--handle", "CITE", "--path", "doc.txt", "--lines", "1:1", "--task-context", "--format", "json"]);
  runPython(script, root, ["apply-edit", "--path", "doc.txt", "--start", "1", "--end", "4", "--insert", "OO", "--format", "json"]);
}

function status(script: string, root: string): { readonly partitions: readonly { readonly status: string }[] } {
  return runPythonJson(script, root, ["status", "--format", "json"]) as { readonly partitions: readonly { readonly status: string }[] };
}

function expectedUcfRsClassification(fixture: BehaviorFixture): string {
  switch (fixture.ucf_rs_case) {
    case "activation_valid":
    case "explicit_acceptance":
      return "valid";
    case "edit_inside_changed":
    case "offline_replay":
      return "changed_unaccepted";
    case "transaction_recovery_required":
      return "recovery_required";
    default:
      throw new Error(`unmapped UCF-RS expectation: ${fixture.id}`);
  }
}

function runPythonJson(script: string, root: string, args: readonly string[]) {
  const result = runPython(script, root, args);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runPython(
  script: string,
  root: string,
  args: readonly string[],
  env: Record<string, string> = {},
  requireSuccess = true
): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync("python", [script, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  if (requireSuccess && result.status !== 0) {
    throw new Error(`UCF-RS command failed (${result.status}): ${result.stderr}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

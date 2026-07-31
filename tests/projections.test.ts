import test from "node:test";
import assert from "node:assert/strict";

import { COMMAND_SCHEMA_VERSION, type CommandEnvelope } from "../packages/protocol/src/index.js";
import { buildProjections } from "../packages/projections/src/index.js";
import { SemanticLog, type SemanticLogRecord } from "../packages/semantic-log/src/index.js";

function command(id: string, operation = "citation.activate", payload = { handle: "AUTH-ROTATE" }): CommandEnvelope {
  return {
    schema_version: COMMAND_SCHEMA_VERSION,
    command_id: id,
    idempotency_key: `idem-${id}`,
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation,
    target: { kind: "document", document_id: "doc-1" },
    payload
  };
}

function sampleLog(): SemanticLog {
  const log = new SemanticLog();
  log.append(command("cmd-1"), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64),
    events: [
      {
        type: "citation.upsert",
        citation_id: "AUTH-ROTATE",
        document_id: "doc-1",
        status: "active",
        range: { start: 0, end: 8 }
      }
    ]
  });
  log.append(command("cmd-2", "citation.activate", { handle: "AUTH-CONFLICT" }), {
    outcome: "conflict",
    code: "UCFY_CONFLICT_AMBIGUOUS_REFERENCE",
    previous_live_version: "sha256:" + "1".repeat(64),
    new_live_version: "sha256:" + "1".repeat(64),
    diagnostics: [{ reason: "ambiguous_reference", handle: "AUTH-CONFLICT" }]
  });
  return log;
}

test("projection rebuild is deterministic regardless of document input order", () => {
  const log = sampleLog();
  const left = buildProjections({
    collaborative: {
      workspace_id: "ws-1",
      documents: [
        { document_id: "doc-2", title: "B", text: "Second" },
        { document_id: "doc-1", title: "A", text: "Alpha beta" }
      ]
    },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true }
  });
  const right = buildProjections({
    collaborative: {
      workspace_id: "ws-1",
      documents: [
        { document_id: "doc-1", title: "A", text: "Alpha beta" },
        { document_id: "doc-2", title: "B", text: "Second" }
      ]
    },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true }
  });

  assert.deepEqual(left.documents, right.documents);
  assert.equal(left.accepted_projection_digest, right.accepted_projection_digest);
  assert.equal(left.workspace_status.live_version, right.workspace_status.live_version);
});

test("capability filtering changes agent view but not accepted projection identity", () => {
  const log = sampleLog();
  const base = {
    collaborative: {
      workspace_id: "ws-1",
      documents: [{ document_id: "doc-1", title: "A", text: "Alpha beta" }]
    },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1"
  };
  const readable = buildProjections({
    ...base,
    capability: { actor_id: "reader", can_read_content: true, can_write: false, can_accept: false }
  });
  const redacted = buildProjections({
    ...base,
    capability: { actor_id: "redacted", can_read_content: false, can_write: false, can_accept: false }
  });

  assert.equal(readable.accepted_projection_digest, redacted.accepted_projection_digest);
  assert.notEqual(readable.agent_view_response_digest, redacted.agent_view_response_digest);
  assert.equal(redacted.documents[0]?.text, null);
  assert.equal(readable.agent_view.documents[0]?.text, "Alpha beta");
  assert.equal(redacted.agent_view.documents[0]?.text, null);
});

test("projection rebuild rejects invalid semantic logs", () => {
  const log = sampleLog();
  const damaged = log.snapshot().filter((record) => record.record_type !== "outcome") as SemanticLogRecord[];
  assert.throws(() =>
    buildProjections({
      collaborative: { workspace_id: "ws-1", documents: [] },
      semantic_log: damaged,
      reducer_version: "reducer.v1",
      capability: { actor_id: "actor-1", can_read_content: true, can_write: false, can_accept: false }
    })
  );
});

test("projection rebuild exposes citations, conflicts, allowed actions, and bounded agent view", () => {
  const log = sampleLog();
  const projections = buildProjections({
    collaborative: {
      workspace_id: "ws-1",
      documents: [
        { document_id: "doc-1", title: "A", text: "Alpha beta" },
        { document_id: "doc-2", title: "B", text: "Second" }
      ]
    },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true, max_agent_items: 1 }
  });

  assert.equal(projections.workspace_status.document_count, 2);
  assert.equal(projections.workspace_status.citation_count, 1);
  assert.equal(projections.workspace_status.conflict_count, 1);
  assert.equal(projections.citations[0]?.citation_id, "AUTH-ROTATE");
  assert.equal(projections.conflicts[0]?.code, "UCFY_CONFLICT_AMBIGUOUS_REFERENCE");
  assert.deepEqual(projections.allowed_actions, ["checkpoint.create", "citation.activate", "document.replace_range", "workspace.read"]);
  assert.equal(projections.agent_view.documents.length, 1);
  assert.match(projections.anchor_projection_digest, /^sha256:[0-9a-f]{64}$/);
});

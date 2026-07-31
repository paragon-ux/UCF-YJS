import test from "node:test";
import assert from "node:assert/strict";

import { classifyCitation, createCitation } from "../packages/domain-citations/src/index.js";

test("classification preserves an unresolved-anchor missing status", () => {
  const citation = createCitation({
    citation_id: "c1",
    document_id: "doc-1",
    text: "Alpha beta",
    start: 0,
    end: 5
  });
  citation.status = "missing";

  assert.equal(classifyCitation(citation, "Alpha beta"), "missing");
  assert.equal(citation.status, "missing");
});

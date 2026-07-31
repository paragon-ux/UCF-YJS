# M1.4 Behavioral Conformance Corpus

Status: accepted

M1 introduces `ucf.behavior_fixtures.v1`, a semantic-only fixture corpus under
`tests/conformance/behavior-fixtures.json`.

The fixture corpus records initial logical documents, ordered intentions,
offline or recovery conditions, and expected outcome classes. It explicitly
does not compare storage layout, private record shape, or canonical hash
equality between implementations.

UCF-Yjs uses a TypeScript adapter that drives `WorkspaceProcessor` and provider
convergence behavior. UCF-RS uses an independent CLI adapter that shells out to
`scripts/ucf_rs.py` in the sibling repository. The adapters share fixture
intent and expected semantic classification data only; they do not share runtime
code, storage formats, transaction formats, or hash algorithms.

The UCF-RS oracle version is `ucf.behavior_oracle.v1`. Any future behavior
change in UCF-RS fixture expectations requires an explicit oracle-version
review instead of silently changing the shared corpus.

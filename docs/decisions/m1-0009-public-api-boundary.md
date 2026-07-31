# M1.9 Public API Boundary

Status: accepted

M1 exposes explicit package subpaths through `package.json` `exports`.
Consumers must use public subpaths such as `ucf-yjs/runtime` and
`ucf-yjs/protocol`; private source paths are intentionally not exported.

The API snapshot is `api-surface/m1-public-api.json`. `npm run
test:public-api` imports every public subpath, compares exported runtime values
to the snapshot, rejects private source-path imports, checks dependency/license
boundaries, and verifies protocol declarations do not expose provider snapshot
fields as protocol types.

Provider packages remain separately exported behind their package contracts;
provider internals are not protocol or reducer public types.

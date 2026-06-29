# Contributing to @expys/sdk

## Dev setup

From the monorepo root (or this package):

```sh
bun install
```

All dev tooling is hoisted to the repo-root `node_modules`; there is no separate
per-package install.

## Commands

Run from `packages/sdk-ts`:

```sh
bun run codegen        # regenerate src/generated/schema.ts from the spec
bun run codegen:check  # fail on generated drift
bun run lint           # eslint (prettier enforced via plugin)
bun run typecheck      # tsc --noEmit (strict, includes examples)
bun test               # bun test + coverage gate (>= 0.90, see bunfig.toml)
bun run build          # tsdown -> dist (esm + cjs + d.ts + sourcemaps)
bun run attw           # are-the-types-wrong  (run after build)
bun run publint        # packaging hygiene    (run after build)
bun run size           # bundle-size budget   (run after build)
bun run docs           # typedoc -> docs-api (HTML + JSON model; gates doc coverage)
```

### Cross-runtime smoke

After `bun run build`, prove the artifact loads on every supported runtime:

```sh
bun scripts/smoke.mjs
node scripts/smoke.mjs
deno run scripts/smoke.mjs
```

### Integration suite (opt-in, real sandbox)

Skipped unless both env vars are set; it never runs in normal CI:

```sh
EXPYS_INTEGRATION=1 EXPYS_MEMBER_TOKEN=<sandbox member token> \
  bun test src/__tests__/integration.test.ts
```

## House rules

- No emojis in code, comments, or docs.
- Immutability - never mutate objects or arrays.
- No `console.log` in shipped code (examples and scripts may print).
- TDD: write tests first; keep coverage at or above the gate.
- Small files (200-400 lines typical).

## Public surface and cross-SDK parity

- The runtime public surface is pinned by `src/__tests__/public.surface.test.ts`.
  Anything newly exported must be added there on purpose, with a TSDoc comment and
  an `@example`.
- The method names, config option names, error taxonomy, retry/idempotency
  semantics, and `User-Agent` format are a frozen contract shared with the Swift
  and Kotlin SDKs. Do not change them here without mirroring the change in the
  other two SDKs and the spec. CI enforces spec drift and native-model parity.
- Never hand-edit `src/generated/**`; regenerate via `bun run codegen`.
- No new runtime dependencies (the SDK is fetch-only and zero-dep) without
  explicit sign-off.

## Releasing

Releases are tag-driven (lead engineer, with approval):

```sh
# Record the change with a changeset at the repo root, bump the version, then:
git tag ts/vX.Y.Z
git push origin ts/vX.Y.Z
```

The tag triggers [`sdk-release.yml`](../../.github/workflows/sdk-release.yml): it
re-verifies spec/parity, syncs the version, runs the coverage-gated tests, builds,
and publishes to npm with provenance. The embedded `SDK_VERSION`/`SPEC_VERSION`
are injected at build time from `package.json` and the spec (see
`tsdown.config.ts`) - there is no manual version edit.

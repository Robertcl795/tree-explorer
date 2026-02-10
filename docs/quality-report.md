# Quality Report

Date: 2026-02-10
Scope: repository-wide docs and implementation quality status

## Current Baseline

- Angular baseline standardized to `19.2.x` across workspace manifests.
- Query filtering contract implemented in core and wired in Angular/Lit wrappers.
- Storybook includes filtering scenarios and page-aware virtual-scroll validation.
- Documentation now reflects current behavior rather than pre-refactor assumptions.

## Deprecated Content Removed

The previous quality report described known pre-refactor defects that are now resolved or no longer accurate.

Deprecated findings removed from active report:

- no filter contract in core
- wrapper-only filtering behavior
- missing filtering stories
- docs claiming architecture gaps already closed

## Quality Checklist

### Core behavior checklist

- [x] `TreeEngine` exposes filtering lifecycle methods.
- [x] Adapter extension points support domain-owned matching.
- [x] Backward compatibility for `adapter.isVisible` is preserved.
- [x] Placeholder semantics remain virtualization-safe under filtering.
- [x] `selectRange` supports filtered row order when adapter/config context is provided.
- [x] Filtering mode contract is explicit (`client` | `hybrid` | `server`).

### Wrapper integration checklist

- [x] Angular wrapper accepts `filterQuery` input.
- [x] Angular service re-applies filter on relevant state changes.
- [x] Lit POC has `filterQuery` parity.
- [x] Wrapper spec typing is compatible with signal input APIs.

### Documentation checklist

- [x] Root `README.md` functions as documentation hub.
- [x] Architecture diagrams are flowchart-based and GitHub-safe.
- [x] Filtering review reflects current contract and risks.
- [x] Next-steps roadmap includes filtering and platform strategy.
- [x] Filtering cookbook stories include client, hybrid, and server examples.
- [x] Docs sanity check script (`pnpm docs:check`) is in place.

## Remaining Risks

1. Filtering is still full-scan O(n) per recompute on large loaded trees.
2. Hybrid mode deeper-match loading remains wrapper strategy, not core scheduler policy.
3. Cookbook examples exist, but integration tests for filtering + paging combinations are still limited.
4. Browser-based Karma tests can be environment-limited in sandbox/CI images without browser/runtime support.

## Recommended Validation Gate

Use this minimum gate before release:

```bash
pnpm typecheck
pnpm docs:check
pnpm storybook:build
```

Optional in browser-enabled CI:

```bash
pnpm test
```

## Quality Priorities (Next)

### P0

1. Add integration tests for server/hybrid cookbook scenarios.
2. Add performance guardrails for high-frequency filter updates.

### P1

1. Add performance instrumentation for query recompute.
2. Add more Storybook interaction assertions for filtering + pagination together.

### P2

1. Add index-assisted filtering strategy for very large loaded sets.
2. Evaluate query analytics hooks for product observability.

# Filtering Review

Date: 2026-02-10
Scope: `@tree-core`, `@tree-explorer`, `@lit-tree-explorer`

## Executive Summary

Filtering is now a first-class core contract and no longer wrapper-only behavior.

Implemented:

- `TreeEngine.setFilter(filterQuery)`
- `TreeEngine.clearFilter()`
- `TreeEngine.reapplyFilter(adapter)`
- `TreeEngine.getFilteredFlatList(adapter, config)`
- Adapter extension points:
  - `matches(data, query)`
  - `getSearchText(data)`
  - `highlightRanges(label, query)`

Backward compatibility preserved:

- `adapter.isVisible` is still supported.
- `getVisibleRows()` delegates to the filtered row pipeline.

## A) Current Design Summary

### Where filtering is implemented

- Core engine:
  - query normalization
  - row visibility derivation
  - optional policies (ancestor visibility, auto-expand, selection pruning)
- Angular wrapper:
  - `filterQuery` input forwards to service/engine
- Lit wrapper:
  - `filterQuery` property forwards to engine for parity

### Filtering modes currently available

- Client-side filtering over loaded nodes
- Hybrid filtering mode:
  - core filters loaded nodes, wrappers may trigger deeper fetch strategies
- Server-side mode:
  - adapter/API owns query execution, engine keeps baseline visibility and row orchestration
- Structured query shape:
  - text
  - tokens
  - exact/contains mode
  - case sensitivity
- Hierarchical rendering policy:
  - show ancestors of matched descendants (configurable)
- Optional highlight metadata:
  - adapter-provided or default text highlight

### Sync vs async

- Matching pipeline is synchronous in core.
- Data loading remains async through adapter `loadChildren`.
- Server-side behavior is now explicit via `filtering.mode='server'`.

### What is filtered

- Filtering applies to flattened `TreeNode` state and emits filtered `TreeRowViewModel[]`.
- Placeholder handling remains virtualization-safe and policy-aware.

## B) Complexity Assessment

### Primary complexity sources

- Dual compatibility model:
  - legacy `isVisible`
  - new query pipeline (`matches`/`getSearchText`)
- Policy interactions:
  - `showParentsOfMatches`
  - `autoExpandMatches`
  - `selectionPolicy`
- Large-tree recomputation:
  - flattened traversal and matching are still O(n) per query/state refresh.

### Ease of adding capabilities (1 = hard, 5 = easy)

| Capability | Score | Notes |
| --- | --- | --- |
| Simple text search | 4/5 | Core contract implemented; wrapper input available |
| Multi-criteria filters | 3/5 | Query shape exists; richer field semantics still adapter-defined |
| Server-side filtering | 4/5 | Explicit mode contract exists; cookbook examples still needed |
| Fuzzy search | 2/5 | Needs ranking/scoring contract and ordering policy |
| Highlight matches | 4/5 | Built-in metadata channel available |
| Auto-expand to matches | 4/5 | Config policy implemented |

## C) Shortcomings and Risks

### Correctness and UX risks

- Hidden selection behavior is policy-dependent:
  - `keep` mode can retain selected IDs outside current filter view.
- Ancestor visibility only applies to loaded node graph:
  - unloaded descendants cannot influence visibility until loaded.

### Performance risks

- Matching remains full traversal per recompute.
- No built-in debounce/throttle/cancellation in wrapper layer.
- No index-based acceleration for repeated query updates.

### API risks

- Fuzzy-ranking and secondary ordering contracts are not defined.
- Hybrid mode fetch orchestration is still wrapper-owned and not a strict core loading policy yet.

## D) Recommendations (Prioritized)

### P0

1. Document server-side and hybrid cookbook patterns in Storybook/docs.
2. Add integration tests for policy combinations with pagination placeholders.
3. Add wrapper-level debounce/cancel guidance and defaults.

### P1

1. Add incremental filtering controls (debounce/cancel) at wrapper/service level.
2. Add optional filter indexes for high-frequency query updates.
3. Add explicit server-side mode examples in Storybook.

### P2

1. Define fuzzy scoring/ranking extension points.
2. Add query metrics hooks for profiling.
3. Add hybrid loaded+fetch mode design if needed by product requirements.

## Contract Test Matrix

Required scenarios:

1. Descendant match keeps ancestors visible when configured.
2. Adapter `matches` overrides default text matching.
3. Highlight ranges are emitted for matched rows.
4. `autoExpandMatches` expands ancestor path for loaded matches.
5. `selectionPolicy=clearHidden` prunes filtered-out selections.
6. Legacy `isVisible` remains baseline gate.
7. `selectRange(..., adapter, config)` uses filtered row order when context is provided.
8. `filtering.mode='server'` skips client-side match filtering and highlight emission.

Reference tests:

- [packages/tree-core/src/lib/engine/tree-engine.spec.ts](../packages/tree-core/src/lib/engine/tree-engine.spec.ts)
- [packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts](../packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts)

Cookbook stories:

- [packages/tree-explorer/src/stories/tree-explorer.filtering-cookbook.stories.ts](../packages/tree-explorer/src/stories/tree-explorer.filtering-cookbook.stories.ts)

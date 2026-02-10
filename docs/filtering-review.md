# Filtering Review

## Scope

This review covers current filtering behavior in:

- `@tree-core` (`TreeEngine`, adapter contract, flattening pipeline)
- `@tree-explorer` (Angular wrapper/service state flow)
- `@lit-tree-explorer` (POC parity check)

Cross-reference for proposed target model: `docs/architecture.md#proposed-filtering-model`.

## Filtering Architecture (Current)

Filtering is currently a row visibility gate owned by the adapter:

- Domain-aware rule: `TreeAdapter.isVisible(data)`.
- Execution point: `TreeEngine.getVisibleRows()` and `getRowViewModelsById()`.
- Trigger model: recomputation on tree state version changes (expand/select/load/config/adapter updates), not on a dedicated filter query input.

Flow today:

1. Host component updates `adapter`, `data`, or config.
2. `TreeStateService` updates internal signals and bumps state version.
3. `TreeEngine` flattens expanded graph (`flattenTree`) and maps rows.
4. `adapter.isVisible(data)` is evaluated per row; rows returning `false` are skipped.
5. Angular viewport uses `visibleRows()` for render range and page-aware loading orchestration.

Notes:

- There is no `filter$`, `filterSignal`, `setFilter`, or `applyFilter` API.
- Placeholders are always included in visible rows (virtualization integrity).
- Pinned rows are resolved by ID and can still be rendered even when row `visible` is `false`.

## A) Current Design Summary

### Where filtering is implemented

- Core:
  - `TreeAdapter.isVisible(data)` contract
  - `TreeEngine.getVisibleRows()` visibility check
- Angular:
  - No independent filtering pipeline in `TreeExplorerComponent` or `TreeStateService`
- Lit POC:
  - Same engine behavior; no wrapper-specific query model

### Kinds of filtering that exist today

- Exists:
  - Single-row boolean predicate (`isVisible`)
- Not built-in:
  - text query model
  - multi-field or structured criteria
  - fuzzy matching
  - hierarchical match propagation (parent/descendant semantics)
  - match highlighting
  - auto-expand to matches

### Sync vs async

- Current filtering is synchronous and per-row.
- Async filtering is only possible indirectly by reloading data through `loadChildren` or replacing sources.

### What is being filtered

- Filter applies to row view-model production (`TreeRowViewModel`) after node flattening.
- It does not pre-filter the node graph itself.
- It does not alter expand/collapse state directly.

## B) Complexity Assessment

### Sources of complexity

- Hidden multi-layer behavior:
  - `flattenTree` decides structural visibility by expansion state.
  - `adapter.isVisible` decides semantic visibility later during row mapping.
  - Result: two visibility concepts with no explicit contract between them.
- No filter state in engine:
  - Query lifecycle is external and implicit.
  - Consumers must force recomputation by swapping adapter/config/data.
- Duplication risk:
  - Consumers can implement filtering in adapters, data preprocessing, or wrapper host code with inconsistent outcomes.
- Recompute cost:
  - `flattenTree` + row mapping + adapter callbacks run on each relevant state bump (selection/expand/load included).
- Extension friction:
  - Adapter predicate has no query context type.
  - No built-in place for fuzzy scoring, tokenization, or highlight metadata.
- Virtualization coupling risk:
  - Filtering behavior can indirectly impact range loading if visible list changes without an explicit filter event contract.

### Ease to add new capabilities (1 = hard, 5 = easy)

| Capability | Score | Why |
| --- | --- | --- |
| Simple text search | 2/5 | Possible through adapter closure + host-triggered recompute, but no first-class query API |
| Multi-criteria filters | 1/5 | No typed filter model or composable criteria contract |
| Server-side filtering | 2/5 | Feasible via adapter/API and data reset, but no standardized core lifecycle |
| Fuzzy search | 1/5 | No scoring contract and no query/index abstraction |
| Highlight matches | 1/5 | Row model has no match metadata channel |
| Auto-expand to matches | 1/5 | Requires custom traversal/orchestration outside current filtering path |

## C) Shortcomings and Risks

### Correctness risks

- Parent/descendant semantics are undefined:
  - A hidden parent can still have visible descendants if already expanded.
  - A matching descendant under a collapsed ancestor will remain hidden.
- Selection consistency:
  - Selected IDs can include filtered-out nodes.
  - `selectionChange` emits selected nodes regardless of visibility.
- Pinned rows mismatch:
  - Pinned rows are fetched by ID and rendered without filtering gate.
- Navigation/focus stability:
  - No keyboard navigation contract is documented for filtering transitions; focus behavior under dynamic visibility changes is unspecified.

### Performance risks (large trees)

- O(n) scans and allocations on each recompute:
  - flattening + view-model mapping + adapter calls per row.
- Per-keystroke strategy gap:
  - No built-in debounce/cancel/incremental filtering lifecycle.
- Potential virtualization mismatch:
  - If filtering is driven externally without explicit state sync, rendered range/load decisions can lag or thrash.

### API/architecture risks

- Extension points are unclear:
  - `isVisible` is too narrow for modern filtering requirements.
- Adapter ownership is under-specified:
  - Domain matching is in adapter, but query state and orchestration currently have no home.
- Public API gap:
  - No canonical filter contract in `@tree-core`, so wrapper/consumer behavior can diverge.

## D) Recommendations (Prioritized)

### P0 (must)

1. Define and document a core filter contract in `@tree-core`:
   - `setFilter(filterQuery)`, `clearFilter()`, `getFilteredFlatList()`.
2. Keep adapter as the only domain-aware layer:
   - add typed adapter extension point (`getSearchText` or `matches`).
3. Document deterministic behavior flags:
   - parent visibility by descendant match,
   - auto-expand policy,
   - selection policy under active filtering.
4. Preserve backward compatibility:
   - treat `adapter.isVisible` as legacy predicate mode with deprecation guidance.

### P1 (should)

1. Add incremental filtering controls:
   - debounce window, stale computation cancellation.
2. Add row match metadata channel:
   - optional highlight ranges to avoid UI-side re-parsing.
3. Add tests focused on correctness boundaries:
   - collapsed ancestor + descendant match
   - selection with filtered-out nodes
   - paged placeholders under active filtering

### P2 (nice-to-have)

1. Add hybrid filtering mode:
   - loaded-node filter with optional deeper match loading strategy.
2. Add fuzzy ranking extension:
   - adapter-owned ranking keys with stable sort contract.
3. Add wrapper parity targets:
   - align Angular and Lit wrappers on filter contract behavior.


# TreeEngine Re-Audit (Post-Refactor)

Date: 2026-02-10  
Scope:
- `packages/tree-core/src/lib/engine/*`
- `packages/tree-core/src/lib/types/*`
- `packages/tree-explorer/src/lib/services/tree.service.ts`
- `packages/tree-explorer/src/stories/*.stories.ts`

## Executive Summary

The engine split is complete and in production shape:

1. `TreeEngine` is now an orchestrator/facade, not a logic dump.
2. Hot paths are modularized and mostly linear in the impacted working set.
3. Projection and flattening caches remove repeated recomputation on read-heavy paths.
4. `adapter.isLeaf(data, ctx?)` precedence is implemented and covered.
5. Storybook includes the requested error and edge-case coverage plus deep pinned navigation.
6. Docs are aligned with the current architecture and Storybook structure.

## Criteria Status Matrix

| Requested criteria | Status | Evidence |
|---|---|---|
| TreeEngine decomposition into focused modules | Complete | `packages/tree-core/src/lib/engine/tree-engine.ts`, `packages/tree-core/src/lib/engine/flattening.ts`, `packages/tree-core/src/lib/engine/paging.ts`, `packages/tree-core/src/lib/engine/visibility.ts`, `packages/tree-core/src/lib/engine/selection.ts`, `packages/tree-core/src/lib/engine/expansion.ts`, `packages/tree-core/src/lib/engine/loading.ts`, `packages/tree-core/src/lib/engine/navigation.ts`, `packages/tree-core/src/lib/engine/node-index.ts`, `packages/tree-core/src/lib/engine/utils.ts`, `packages/tree-core/src/lib/engine/types.ts` |
| Per-module tests for critical behavior | Complete | `packages/tree-core/src/lib/engine/*.spec.ts` |
| Linear hot paths and reduced repeated computation | Complete (with one known gap) | Flatten cache + projection cache in `packages/tree-core/src/lib/engine/tree-engine.ts`; page range scheduler and page patching in `packages/tree-core/src/lib/engine/paging.ts` |
| Type simplification and reduced one-off type noise | Complete | Shared internals constrained to `packages/tree-core/src/lib/engine/types.ts`; pure helpers in `packages/tree-core/src/lib/engine/utils.ts` |
| Adapter `isLeaf` override precedence | Complete | `packages/tree-core/src/lib/engine/visibility.ts`, `packages/tree-core/src/lib/types/tree-adapter.ts`, `packages/tree-core/src/lib/engine/visibility.spec.ts` |
| Storybook error/edge coverage | Complete | `packages/tree-explorer/src/stories/tree-explorer.errors-edge-cases.stories.ts` |
| Pinned async deep navigation validation | Complete | `packages/tree-explorer/src/stories/tree-explorer.pinned-cookbook.stories.ts` |
| Docs and diagrams aligned to runtime behavior | Complete | `docs/architecture.md`, `docs/page-aware-virtual-scroll.md`, `docs/filtering-review.md`, `docs/pinned-items.md`, `docs/theming.md` |

## Current Responsibilities by Module

### Facade

- `tree-engine.ts`
  - Owns runtime state references and cache invalidation keys.
  - Delegates behavior to focused modules.
  - Maintains public API stability for wrappers/services.

### Indexing and traversal

- `node-index.ts`
  - Ancestor/descendant lookup wrappers.
- `flattening.ts`
  - Flattened graph cache keyed by `(nodesRef, expandedRef)`.

### Mutation modules

- `expansion.ts`
  - Expand/collapse transitions.
  - Lazy-load trigger decision on first expansion.
- `selection.ts`
  - Single/multi/hierarchical selection + range helpers.
- `paging.ts`
  - Pagination state, in-flight tracking, error pages.
  - Placeholder slot priming and page patching.
- `loading.ts`
  - Node loading/error transitions.

### Projection, filtering, navigation

- `visibility.ts`
  - Query normalization.
  - Filter visibility policy.
  - Row projection and placeholder row rendering.
  - `isLeaf` precedence resolution.
- `navigation.ts`
  - Path build/expand helpers and visible index lookup.

### Internal-only shared contracts

- `types.ts`
  - Engine-internal state and projection cache contracts.
- `utils.ts`
  - Small pure helpers and factory/fingerprint functions.

## Public API Surface (Current)

Primary facade methods in `TreeEngine`:

- Setup/state:
  - `configure`, `init`, `getNode`, `getFilterQuery`, `stats`
- Expansion/selection:
  - `toggleExpand`, `expandPath`
  - `selectNone`, `selectOne`, `selectToggle`, `selectRange`, `selectBranch`
- Paging:
  - `setPagination`, `hasPagination`, `getPagedNodeDebugState`
  - `primePagedPlaceholders`, `markPageInFlight`, `ensureRangeLoaded`
  - `applyPagedChildren`, `clearPageInFlight`, `setPageError`, `clearPageError`
- Loading/errors:
  - `clearLoading`, `setNodeError`, `clearNodeError`, `clearChildren`
- Filtering/projection:
  - `setFilter`, `clearFilter`, `reapplyFilter`
  - `getFilteredFlatList`, `getRowViewModelsById`
  - `getVisibleRows` (compat alias retained)

## Hot Paths and Complexity

### 1) Flatten + projection reads

- `getFilteredFlatList` and `getRowViewModelsById` both consume a shared projection cache.
- Cache key dimensions include:
  - adapter ref
  - node/expansion/selection/loading/error refs
  - filter fingerprint + filter config fingerprint
  - paging version
- Result:
  - repeated reads after no state change are O(1) cache hits.
  - recompute remains O(n) for traversed nodes when state changes.

### 2) Range-based page scheduling

- `ensureRangeLoadedPages` in `paging.ts` computes affected page span and marks only missing pages.
- Complexity:
  - O(p), `p = pages touched by [start,end]`.
- No total-branch scan for range scheduling.

### 3) Page patching and placeholder behavior

- `applyPagedChildrenState` behavior:
  - shape-change path (when `totalCount` changes): materialize slots O(totalCount)
  - steady-state path: patch only affected indices O(k), `k = children in loaded pages`
- This is the intended performance profile for large paged branches.

### 4) Selection and expansion

- Map/set based state transitions.
- Branch/range operations scale with impacted branch/range, not all nodes, except where hierarchical semantics require subtree traversal.

## Coupling and Boundary Review

### Good boundaries

- Adapter remains the domain boundary:
  - IDs, labels, match semantics, leaf semantics, pagination contract, path resolution.
- UI context menu ownership remains in Angular wrapper:
  - no context-menu policy in `@tree-core`.

### Intended coupling still present

- Placeholder display labels are still projected in core (`visibility.ts`) as view-model content.
  - This is acceptable for now because placeholder semantics are engine-owned and wrapper-agnostic.

## Type and Repetition Review

### Improvements confirmed

- Single-use structural types were reduced and moved out of facade logic.
- Shared engine types are scoped to `engine/types.ts` instead of scattered one-off interfaces.
- Repeated projection logic is centralized in `visibility.ts`:
  - placeholder row creation in one function
  - projection map/list built once per cache miss

### Remaining acceptable duplication

- Similar row-shape construction still exists for placeholder vs non-placeholder rows by design.
- This duplication is small, explicit, and keeps hot path branching predictable.

## Test Coverage Snapshot

Core module specs exist for:

- `flattening.spec.ts`
- `expansion.spec.ts`
- `selection.spec.ts`
- `paging.spec.ts`
- `visibility.spec.ts`
- `tree-engine.spec.ts`

Wrapper/service specs verify pinned and navigation flows:

- `packages/tree-explorer/src/lib/services/tree.service.spec.ts`
- `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts`

## Remaining Risks and Gaps

1. Filter recomputation after state changes is still O(n) on loaded nodes.
2. Very large hybrid filtering scenarios still rely on wrapper orchestration for deeper loads.
3. Cross-feature integration tests (filtering + paging + pinned navigation together) can be expanded.

## Recommended Next Steps

1. Add query index/projection acceleration for very large loaded datasets.
2. Add combined integration tests for filtering + page-aware + pinned navigation.
3. Add lightweight perf instrumentation to measure projection cache hit rates and filter recompute cost.

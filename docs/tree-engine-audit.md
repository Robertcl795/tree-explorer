# TreeEngine Audit

Date: 2026-02-10  
Scope: `packages/tree-core/src/lib/engine/tree-engine.ts`

## Current Responsibilities

`TreeEngine<T>` currently owns all of these concerns in one class:

1. Core tree state:
   - `nodes`, `expanded`, `selected`, `loading`, `errors`
2. Pagination state:
   - per-parent `pageSize`, loaded/in-flight/error page tracking, total counts
3. Expansion behavior:
   - expand/collapse toggles, ancestor-path expansion
4. Selection behavior:
   - none/single/multi/hierarchical modes, branch/range selection
5. Flattening and visibility:
   - flatten expanded tree
   - filtering and visibility policy application
6. Row projection:
   - adapter-driven mapping from `TreeNode` to `TreeRowViewModel`
   - placeholder row synthesis and page error labels
7. Async loading orchestration state:
   - initial child loading flags
   - paged in-flight and page failure states
8. Error state handling:
   - node-level and page-level error registration/clear
9. Virtualization strategy decision:
   - auto flat/deep strategy based on node count and depth

This is functionally complete but too broad for maintainability and test isolation.

## Public API Surface

Public methods from `TreeEngine` today:

- Configuration and read access:
  - `configure`
  - `getFilterQuery`
  - `nodes`, `expandedIds`, `selectedIds`, `loadingIds`, `stats`
  - `getNode`
  - `getPagedNodeDebugState`
  - `hasPagination`
  - `getVirtualizationStrategy`
- Initialization and structure updates:
  - `init`
  - `setChildrenLoaded`
  - `clearChildren`
  - `expandPath`
- Expansion and selection:
  - `toggleExpand`
  - `selectNone`, `selectOne`, `selectToggle`, `selectRange`, `selectBranch`
- Paging lifecycle:
  - `setPagination`
  - `markPageInFlight`
  - `ensureRangeLoaded`
  - `applyPagedChildren`
  - `clearPageInFlight`
  - `setPageError`
  - `clearPageError`
- Loading/error lifecycle:
  - `clearLoading`
  - `setNodeError`
  - `clearNodeError`
- Filtering + rows:
  - `setFilter`, `clearFilter`, `reapplyFilter`
  - `getFilteredFlatList`
  - `getVisibleRows` (compat alias)
  - `getRowViewModelsById`

## Internal Dependency Map

`tree-engine.ts` directly depends on:

- `../utils/tree-utils`
  - `flattenTree`, `getAncestorIds`, `getDescendantIds`
  - `calculateHierarchicalSelection`, `toggleHierarchicalSelection`
  - `getSelectionRange`, `getMaxDepth`
- `../types/tree-config`
- `../types/tree-adapter`
- `../types/tree-filter`
- `../types/tree-pagination`
- `../types/tree-node`

Internal sections mixed in one file:

1. State and pagination storage
2. Pagination mutation logic
3. Loading/error mutation logic
4. Expansion/selection logic
5. Filter normalization and matching logic
6. Visibility derivation
7. Row projection (including placeholder rendering)

## Hot Path Analysis

### 1) Render range updates (`ensureRangeLoaded`)

- Triggered from virtual-scroll range changes.
- Current behavior:
  - computes page span from child index range
  - calls `markPageInFlight` for each page
- Complexity:
  - O(pages in range)
- Good:
  - linear in requested range pages
  - deduped by loaded/in-flight checks

### 2) Page patching (`applyPagedChildren`)

- Current behavior:
  - creates `nextChildrenIds = new Array(totalCount)`
  - loops across full `totalCount` to pre-fill placeholders or preserve loaded rows
  - patches loaded page range
- Complexity:
  - O(totalCount) per page update in steady state
- Risk:
  - unnecessary repeated full-array work for large paged branches

### 3) Flatten + visible row derivation

- `getFilteredFlatList` and `getRowViewModelsById` both:
  - flatten tree
  - recompute selection hierarchy
  - recompute filter visibility state
  - project row view models
- Complexity:
  - O(n) each call, but duplicated per read path
- Risk:
  - repeated computation during frequent viewport updates

### 4) Expansion/selection operations

- Mostly set/map-based updates with helper traversals.
- Complexity:
  - expansion toggle O(1)
  - path expansion O(ancestor depth)
  - branch selection O(descendant count)
  - hierarchical selection depends on full selected subtree normalization

## Complexity and Coupling Report

### UI coupling

- Row labels for placeholders (`Loading...`, `Failed to load page`) are inside core engine.
- `TreeRowViewModel` projection logic is embedded in core mutation file.

### Adapter coupling

- Adapter behavior (`getLabel`, `isDisabled`, `isLeaf`, `matches`, `getSearchText`, `highlightRanges`, `hasChildren`) is invoked directly in engine row/filter logic.
- Leaf resolution precedence exists but is embedded in row generation path.

### Persistence/integration coupling

- Core doesn’t call persistence directly (good).
- But page error semantics are represented as parent-level node errors, which wrappers interpret for retry UX.

Overall:

- Domain boundary is correct (adapter-owned), but orchestration + projection + policy + pagination are over-coupled in one class.

## Redundant / Single-Use Types

Types declared inside `tree-engine.ts`:

- `TreeState<T>`: used throughout engine internals only.
- `TreePagedNodeState`: used by pagination internals only.
- `FilteredVisibilityState`: used by filter/visibility internals only.
- `TreePagedNodeDebugState`, `TreeStats`: exported and useful externally.

Findings:

- Internal-only interfaces are valid but should move into focused engine-internal modules.
- Several temporary object shapes are repeated inline (row projections, placeholder rows).
- Current single-file type declarations force unrelated concerns to share one type namespace.

## Repetition Report

### Repeated object construction

- `TreeRowViewModel` objects are built in both:
  - `getFilteredFlatList`
  - `getRowViewModelsById`
- Placeholder rows are built repeatedly with near-identical shape.

### Repeated computations

- `flattenedNodes()` repeated in multiple methods.
- `calculateHierarchicalSelection(...)` recalculated per read path.
- `computeFilteredVisibility(...)` recalculated per read path.
- Label/icon/isLeaf/highlight derivations duplicated per method.

### Duplicated code paths

- Filtering row projection logic duplicated between full-list and by-id retrieval.
- Page-loading state mutation patterns are repeated with slight variations.

## Proposed Split Map (Method-to-Module)

### `tree-engine.ts` (facade/orchestrator)

- Public API methods remain stable.
- Delegates to module functions/classes.
- Owns cache invalidation/version counters and module wiring.

### `node-index.ts`

- `getAncestorIds` / `getDescendantIds` usage wrappers
- id-parent-child lookup helpers

### `flattening.ts`

- Flatten expanded tree logic and flattened cache

### `expansion.ts`

- `toggleExpand`
- `expandPath`

### `selection.ts`

- `selectNone`, `selectOne`, `selectToggle`, `selectRange`, `selectBranch`

### `paging.ts`

- `setPagination`, `hasPagination`, `getPagedNodeDebugState`
- `markPageInFlight`, `ensureRangeLoaded`
- `applyPagedChildren`, `clearPageInFlight`, `setPageError`, `clearPageError`

### `loading.ts`

- `clearLoading`, `setNodeError`, `clearNodeError`

### `visibility.ts`

- filter normalization/fingerprint/query term handling
- visibility derivation and filter policies
- row projection and placeholder row mapping
- `resolveIsLeaf` precedence handling

### `navigation.ts`

- `expandPath` orchestration helpers
- node visibility lookup helpers for wrappers
- async pinned navigation helpers (adapter path integration)

### `types.ts` (internal shared types only)

- internal state and cache types used across modules
- no public exports except through facade types that are already public today

### `utils.ts`

- small shared pure helpers
- avoids copy-paste state clone snippets

## Refactor Risk Notes

1. Placeholder stability is a hard invariant for virtualization:
   - keep deterministic IDs and positional replacement behavior.
2. Filter + selection interaction is regression-prone:
   - preserve server/client/hybrid mode behavior and `clearHidden` policy.
3. `isLeaf` precedence changes must remain backward compatible.
4. Keep context menu and UI actions out of core (already true; preserve).

## Refactor Acceptance Checklist

- [x] Audit completed before code refactor.
- [ ] Engine decomposed into focused modules with thin facade.
- [ ] Hot-path recomputation reduced via caches/version keys.
- [ ] Page patching avoids repeated O(totalCount) work on steady-state page loads.
- [ ] Tests split by module responsibility.
- [ ] Public API compatibility preserved and migration notes added.

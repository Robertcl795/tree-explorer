# Documentation Layout Proposal

> Information architecture for td-tree-explorer library documentation.
> Every section has a stated purpose, audience, and content scope.

---

## Proposed Sidebar / TOC

```
td-tree-explorer docs/
├── 1. Overview
├── 2. Quickstart
│   ├── Covalent / Angular usage
│   └── Lit wrapper (POC)
├── 3. Core Concepts
│   ├── TreeEngine
│   ├── TreeNode & TreeRowViewModel
│   ├── TreeAdapter
│   └── Projection / Rows model
├── 4. Configuration
│   ├── Virtual scroll
│   ├── Page-aware loading
│   ├── Selection
│   ├── Context menu
│   └── Pinned items
├── 5. Adapter Guide
│   ├── Required & optional methods
│   ├── Cancellation behavior
│   ├── Error model
│   └── Performance tips
├── 6. Features
│   ├── Virtualization + page-aware scroll
│   ├── Range-loading
│   ├── Keyboard navigation & a11y
│   ├── Selection & multi-select
│   ├── Context menu
│   ├── Pinned items
│   ├── Filtering / search
│   └── Error states & retry
├── 7. Theming
│   ├── CSS custom properties contract
│   ├── Design-system integration
│   └── Dense / high-contrast modes
├── 8. Performance
│   ├── Budgets & invariants
│   ├── Anti-patterns
│   └── Instrumentation
├── 9. Testing & Storybook
│   ├── Story organization
│   ├── Mocks & harnesses
│   └── Deterministic rules
├── 10. API Reference
│   ├── @tree-core exports
│   └── @tree-explorer exports
├── 11. Migration Notes
│   └── async-tree → tree-core + tree-explorer
└── 12. FAQ / Troubleshooting
```

---

## Section Details

### 1. Overview

| | |
|---|---|
| **Purpose** | Explain what problem the library solves and what it explicitly does NOT solve. |
| **Audience** | Everyone: evaluators, integrators, contributors. |
| **Contains** | Problem statement (large async trees with virtualization). Non-goals (not a file manager, not a general list component). Architecture elevator pitch. Link to architecture deep-dive. |

Content outline:
- What: a tree rendering engine + Angular wrapper for very large, paginated, filterable hierarchical datasets.
- Why: CDK virtual scroll alone doesn't handle page-aware lazy loading, placeholder geometry, or adapter-driven domain mapping.
- Non-goals: not a design system, not a data store, not a search engine. The library orchestrates tree state; the adapter owns domain logic.
- Key differentiators: framework-agnostic engine, deterministic placeholder IDs, per-parent pagination, adapter-owned matching semantics, signal-based reactive service.

### 2. Quickstart

| | |
|---|---|
| **Purpose** | Get a working tree on screen in <5 minutes. |
| **Audience** | New integrators. |
| **Contains** | Install commands, minimal adapter, minimal component template, expected output screenshot. |

Content outline:
- **2.1 Covalent / Angular usage** (primary path)
  - Install: `pnpm add @tree-core @tree-explorer`
  - Define adapter (3 methods: getId, getLabel, getChildren)
  - Drop `<tree-explorer>` with inputs
  - Expected behavior description
- **2.2 Lit wrapper (POC)**
  - Import `@lit-tree-explorer`
  - Same adapter, `<tree-explorer-lit>` tag
  - Note: POC status, not production-ready

### 3. Core Concepts

| | |
|---|---|
| **Purpose** | Build mental model of the library's architecture. |
| **Audience** | Integrators who need to customize behavior, contributors. |
| **Contains** | Diagrams, type definitions, data flow explanations. |

Content outline:
- **3.1 TreeEngine** — The state machine. Owns expansion, selection, filtering, loading, paging, projection. Never holds domain data directly; operates on `TreeNode<T>` references. Mermaid diagram of module decomposition (existing from architecture.md).
- **3.2 TreeNode & TreeRowViewModel** — `TreeNode<T>` is the engine's internal node (id, parentId, level, childrenIds, data, isLeaf, disabled, placeholder). `TreeRowViewModel<T>` extends it with display state (label, icon, visible, expanded, selected, indeterminate, loading, error, highlightRanges). Consumers never construct these; the engine does.
- **3.3 TreeAdapter** — The domain boundary. Maps raw API/domain objects to tree behavior. Owns: ID extraction, label generation, child loading, pagination config, filtering match semantics, path resolution, drag data. Table of all methods with required/optional annotations.
- **3.4 Projection / Rows model** — How `getFilteredFlatList` produces the flat array of `TreeRowViewModel` from the hierarchical node graph. Filtering pipeline, placeholder insertion, cache behavior.

### 4. Configuration

| | |
|---|---|
| **Purpose** | Document every `TreeConfig<T>` option with defaults and interactions. |
| **Audience** | Integrators configuring behavior. |
| **Contains** | Config reference table, interaction matrix, examples. |

Content outline:
- **4.1 Virtual scroll** — `virtualization.mode` ('auto'/'always'/'none'), `virtualization.itemSize`. When to use each. Interaction with row height CSS variable.
- **4.2 Page-aware loading** — How `getPagination` on adapter activates per-parent paging. `pageSize`, `pageIndexing`, `initialTotalCount`. Interaction with `ensureRangeLoaded`.
- **4.3 Selection** — `selection.mode` ('single'/'multi'/'none'). `selection.hierarchical`. Range select behavior.
- **4.4 Context menu** — `actions` array on config. `TreeContextAction<T>` shape. Container-level ownership. Pinned-specific context actions.
- **4.5 Pinned items** — `pinned.enabled`, `pinned.entries`, `pinned.store`, `pinned.dnd`, `pinned.maxItems`, `pinned.canPin`/`canUnpin`. Interaction with `resolvePathToNode`.

### 5. Adapter Guide

| | |
|---|---|
| **Purpose** | Comprehensive guide to implementing `TreeAdapter<TSource, T>`. |
| **Audience** | Integrators building custom adapters. |
| **Contains** | Method-by-method walkthrough, patterns, anti-patterns. |

Content outline:
- **5.1 Required methods** — `getId`, `getLabel`. These MUST be implemented.
- **5.2 Loading methods** — `getChildren` (sync), `loadChildren` (async). `hasChildren` for expand-caret heuristic. `isLeaf` for explicit leaf control with precedence rules.
- **5.3 Pagination methods** — `getPagination`, `loadChildren` with `PageRequest` overload. Return `PageResult<TSource>` with `totalCount`.
- **5.4 Filtering methods** — `matches` (full control), `getSearchText` (simple default), `highlightRanges` (display control).
- **5.5 Navigation methods** — `resolvePathToNode` for pinned async navigation. Path steps and page hints.
- **5.6 Cancellation behavior** — Currently no built-in AbortController. Adapter can implement its own. Recommendation: track in-flight requests and cancel on re-expand.
- **5.7 Error model** — `TreeLoadError` scopes (root/children/navigation) and reasons. How adapter errors propagate through service.
- **5.8 Performance tips** — Keep `getId`/`getLabel` O(1). Avoid heavy allocations in `matches`. Cache API responses outside the adapter. Use `toData`/`transform` for normalization.

### 6. Features

| | |
|---|---|
| **Purpose** | Feature-by-feature reference with "what", "how", "pitfalls", "stories". |
| **Audience** | Integrators and testers. |
| **Contains** | Feature descriptions, sequence diagrams, config, Storybook pointers. |

Content outline:
- **6.1 Virtualization + page-aware scroll** — What: CDK virtual scroll with fixed-height rows plus per-parent pagination. How: adapter provides `getPagination`, engine materializes placeholder slots, viewport range changes trigger `ensureRangeLoaded`. Pitfalls: mismatched `itemSize` and CSS row height, non-deterministic totalCount. Stories: `tree-explorer.virtual-scroll.stories.ts`, `tree-explorer.page-aware*.stories.ts`.
- **6.2 Range-loading** — What: only fetch pages that intersect rendered viewport range. How: `ensureRangeLoadedPages` computes page span, marks missing pages. Pitfalls: fetching all pages on expand. Stories: page-aware stories.
- **6.3 Keyboard navigation & a11y** — What: arrow key navigation, Enter to expand/select, focus management. How: component keyboard handlers. Pitfalls: focus loss on re-render, missing ARIA roles. Stories: advanced stories.
- **6.4 Selection & multi-select** — What: single/multi/hierarchical selection modes. How: `selectToggle`/`selectOne`/`selectRange`/`selectBranch`. Pitfalls: range-select on filtered list without adapter param. Stories: advanced stories.
- **6.5 Context menu** — What: right-click or button-triggered actions. How: `TreeConfig.actions` array, container-level ownership. Pitfalls: putting action logic in row components. Stories: advanced stories.
- **6.6 Pinned items** — What: root-level shortcuts to deep nodes. How: `pinned` config + optional `TreePinnedStore`. Pitfalls: assuming navigation works without `resolvePathToNode` for unloaded targets. Stories: `tree-explorer.pinned-cookbook.stories.ts`.
- **6.7 Filtering / search** — What: query-based visibility reduction. How: `setFilter`/`clearFilter`, adapter `matches`/`getSearchText`. Modes: client/hybrid/server. Pitfalls: duplicating filter logic in adapter and wrapper. Stories: `tree-explorer.filtering-cookbook.stories.ts`.
- **6.8 Error states & retry** — What: root load, child load, page load, navigation errors. How: `TreeLoadError` typed errors, per-page error tracking. Pitfalls: infinite retry loops. Stories: `tree-explorer.errors-edge-cases.stories.ts`.

### 7. Theming

| | |
|---|---|
| **Purpose** | Document CSS custom properties contract for design-system alignment. |
| **Audience** | Design system engineers, frontend developers. |
| **Contains** | Full variable reference, integration patterns, mode recipes. |

Content outline:
- Full `--tree-*` variable table (from tree-theme.css: 66 variables)
- DS integration pattern: map `--tree-*` to `--ds-*` at app shell
- Dense mode recipe: reduce row/padding/font tokens together
- High-contrast recipe: increase focus ring and hover contrast
- Backward-compat `--td-tree-*` aliases
- Highlight tokens: `--tree-highlight-bg`, `--tree-highlight-color`, `--tree-highlight-radius`, `--tree-highlight-padding-inline`

### 8. Performance

| | |
|---|---|
| **Purpose** | Document performance characteristics, budgets, and anti-patterns. |
| **Audience** | Performance engineers, senior integrators. |
| **Contains** | Complexity analysis, budget recommendations, instrumentation. |

Content outline:
- **Budgets**: initial render <100ms for 1K visible rows, filter recompute <50ms for 10K loaded nodes, page patch <10ms per page.
- **Invariants**: projection cache hits are O(1); recompute is O(n) on loaded nodes. Range scheduling is O(p) where p=pages in range. Page patching is O(k) on steady-state.
- **Anti-patterns**: fetching all pages on expand, heavy per-row allocations in adapter methods, duplicating filter logic, bypassing engine state transitions.
- **Instrumentation**: recommended hooks for cache hit rate and recompute duration (currently manual; proposal for built-in counters).

### 9. Testing & Storybook

| | |
|---|---|
| **Purpose** | Where to find tests, how to run them, deterministic rules. |
| **Audience** | Contributors, QA engineers. |
| **Contains** | Story organization, mock patterns, CI commands. |

Content outline:
- Story organization: grouped by feature (Basic Usage, Virtual scroll, Page aware, Filtering, Pinned items, Errors & edge cases)
- Story files: all under `packages/tree-explorer/src/stories/`
- Mocks: inline in story config utilities (`tree-explorer.config.ts`, `tree-explorer.utils.ts`)
- Shared harness: `storybook.config.ts` for global decorators
- Unit tests: Karma + Jasmine, ChromeHeadless
- CI commands: `pnpm typecheck && pnpm test && pnpm storybook:build`
- Deterministic rules: no timers in stories (use delay utilities), stable mock IDs, no external network calls

### 10. API Reference

| | |
|---|---|
| **Purpose** | Exhaustive public export reference. |
| **Audience** | All consumers. |
| **Contains** | Every public type, class, function, constant with signature. |

Content outline:
- **@tree-core exports**: TreeEngine, TreeAdapter, TreeNode, TreeRowViewModel, TreeConfig, DEFAULT_TREE_CONFIG, TreeFilterQuery, TreeFilterInput, TreeFilteringConfig, DEFAULT_TREE_FILTERING_CONFIG, TreePaginationConfig, PageRequest, PageResult, TreePageHint, TreePinnedEntry, TreePinnedStore, TreePinnedConfig, TreeContextAction, TreeLoadError, TreeMatchRange, TreeId, SELECTION_MODES, SelectionMode, VIRTUALIZATION_MODES, TREE_DENSITY, TreeDisplayConfig, TreeVirtualizationConfig, TreeChildrenResult, TreePagedChildrenResult, TreeTransformContext, TreeLeafContext, TreeResolvePathResult, TreeResolvePathResponse, TreeResolvePathStep, mapSourcesToNodeGraph, mapSourcesToNodes, createTreeNode, TreeNodeGraph, flattenTree, getDescendantIds, getAncestorIds, getSelectionRange, calculateHierarchicalSelection, toggleHierarchicalSelection, getMaxDepth, FlattenedNode.
- **@tree-explorer exports**: TreeExplorerComponent, TreeItemComponent, AsyncTreeComponent, DataExplorerCompatComponent, TreeStateService, TreeExplorerModule, TreeHighlightMatchPipe, ObjectTreeAdapter, TREE_CONFIG (InjectionToken), TreeNodeEvent, TreeContextMenuEvent, TreeSelectionEvent, TreeDragEvent, TreePinnedItemView.

### 11. Migration Notes

| | |
|---|---|
| **Purpose** | Guide teams migrating from async-tree or earlier versions. |
| **Audience** | Teams with existing tree integrations. |
| **Contains** | Breaking changes, import path changes, deprecation timeline. |

Content outline:
- async-tree → tree-core + tree-explorer: split boundary, import path changes
- `isLeaf` precedence update
- Filter API adoption (`setFilter`/`clearFilter`/`getFilteredFlatList`)
- Page-aware adoption (`getPagination` + `PageRequest`/`PageResult`)
- Pinned navigation adoption (`resolvePathToNode`)
- Compat wrapper chain: `td-tree` → `async-tree` → `tree-explorer`
- Deprecation candidates: `getVisibleRows` alias, `pinned.ids` shorthand

### 12. FAQ / Troubleshooting

| | |
|---|---|
| **Purpose** | Answer common integration questions. |
| **Audience** | All consumers. |
| **Contains** | Q&A format, error diagnosis, common mistakes. |

Content outline:
- "My tree shows no rows" → check adapter `getId` returns unique strings, check `data` input is non-empty
- "Rows are overlapping/clipped" → check `itemSize` in config matches `--tree-row-height` CSS variable
- "Filter doesn't match anything" → check adapter has `matches` or `getSearchText` implemented
- "Pinned navigation fails" → check adapter has `resolvePathToNode` implemented; check `TreeLoadError.scope === 'navigation'`
- "Page loading fetches everything" → check `getPagination` returns correct config; check `loadChildren` accepts `PageRequest`
- "Selection lost after filtering" → check `filtering.selectionPolicy` is `'keep'` (default) or `'clearHidden'` as intended
- "Build fails with missing @tree-core" → ensure workspace path mapping in tsconfig or `pnpm install` ran

---

## Deliverable Location

This layout proposal should be committed as `docs/docs-layout-proposal.md` and used as the blueprint for rewriting docs in Phase 2 execution.

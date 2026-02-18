# Guided Plan — Rebuild TreeExplorer From Scratch (Feature-Preserving)

## Selected approach
**Approach A: Functional Core + Imperative Shell (Engine-centric, browser-primitive orchestration)**

### Why this approach
- Lowest long-term maintenance: core logic consolidated in `@tree-core` (pure state machine + projection).
- DS layer stays thin and stable (Covalent usage unchanged).
- Deterministic behavior: explicit commands and well-defined transitions.
- Performance-friendly: one projection pipeline, stable IDs, no per-row heavy allocations.
- Avoids framework-specific magic while still Angular 20+ compatible.

---

## Target responsibilities

### `@tree-core` owns
- `TreeEngine<T>` facade and modules:
  - node index, flattening, visibility/projection
  - expansion, selection, filtering
  - paging, loading/error tracking
  - navigation (including pinned navigation support)
- canonical types:
  - `TreeAdapter`, `TreeConfig`, `FilterQuery`, `TreeLoadError`, events
- canonical defaults:
  - `DEFAULT_TREE_CONFIG` and a small `mergeTreeConfig(base, override)` helper (optional)

### `@tree-explorer` owns
- `TreeExplorerComponent` (Covalent-facing, usage unchanged)
- `TreeStateService` (orchestrates adapter calls + owns engine instance)
- optional: pipes/directives strictly for rendering convenience
- CDK virtual scroll integration and DOM event handling (keyboard, context menu)
- no domain logic; no API calls; no “business branching”

---

## Package layout (high-level)
- `packages/tree-core/src/lib/`
  - `engine/` (projection, paging, filtering, selection, navigation, state)
  - `types/` (adapter, config, filter-query, errors, events)
  - `index.ts` (explicit exports only)
- `packages/tree-explorer/src/lib/`
  - `components/tree-explorer/*`
  - `components/tree-item/*` (only if needed; keep it small)
  - `services/tree-state.service.ts`
  - `pipes/*` (optional)
  - `directives/*` (optional)
  - `index.ts`

Testing:
- `testing/stories/*` (compact stories + shared harness)
- `testing/mocks/*` (fixtures + adapters + fake APIs)

---

## Phase 0 — Baseline + contract lock-in (no feature changes)

### Work
- Inventory current public API surface of TreeExplorer (inputs/outputs, exported types).
- Inventory feature set and current story coverage.
- Ensure story categories exist (even if currently failing) as targets:
  - Basic Usage, Virtual scroll, Errors & edge cases, Page aware, Filtering 100+, Pinned items
- Create story harness folder:
  - `testing/stories/_harness/*`
- Create mocks folder:
  - `testing/mocks/*`

### Acceptance criteria
- A single document lists:
  - current TreeExplorer public API (selector + inputs + outputs)
  - required features checklist
  - required stories checklist

### Verification
```bash
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer storybook:build
```

---

## Phase 1 — Core contracts (adapter/config/filterQuery/errors) in `@tree-core`

### Work

* Define canonical:

  * `TreeAdapter<TSource, TNode>`
  * `FilterQuery` (immutable intent object)
  * `TreeConfig<TNode>` (toggles: virtualization, pageAware, selection, actions/contextMenu, pinned, filtering mode)
  * `TreeLoadError` (scope, nodeId, pageIndex, reason)
* Define defaults:

  * `DEFAULT_TREE_CONFIG` and optional merge helper
* Ensure export surface is explicit and minimal.

### Acceptance criteria

* TreeExplorer imports these contracts only from `@tree-core`.
* No duplicate local versions in `@tree-explorer`.

### Verification

```bash
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer test
```

Stories to keep green later (not required yet):

* Filtering (100+ elements) uses canonical FilterQuery.

---

## Phase 2 — Build TreeEngine as the single state machine (projection + paging + filtering + navigation)

### Work

Implement `TreeEngine<T>` facade with clear commands and outputs.

**Commands (examples, adjust to existing API):**

* `setAdapter(adapter)`
* `setConfig(config)`
* `setFilter(query)`
* `toggleExpand(nodeId)`
* `select(nodeId, mode)`
* `ensureRangeLoaded(start, end)` (virtualization/page-aware)
* `applyPagedChildren(parentId, pageIndex, items, totalCount)`
* `applyRootPage(pageIndex, items, totalCount)`
* `navigateToNode(targetId)` (via adapter.resolvePathToNode steps when available)

**Outputs:**

* `rows` (flat projection for rendering)
* selection state
* loading/error state
* navigation results (success/failure payloads)

**Key invariants**

* Only one projection path exists (no parallel caches).
* All transitions are deterministic given previous state + command.
* ID stability is mandatory.

### Acceptance criteria

* Unit tests validate:

  * paging/range correctness
  * filtering correctness (client/server modes)
  * expansion/selection transitions
  * navigation failure modes produce correct `TreeLoadError`

### Verification

```bash
pnpm -C /home/rocker/LABS/tree-explorer test --filter @tree-core
pnpm -C /home/rocker/LABS/tree-explorer build
```

---

## Phase 3 — TreeStateService orchestration (adapter calls + cancellation + page-aware)

### Work

Create `TreeStateService` in `@tree-explorer`:

* Owns:

  * engine instance
  * adapter reference
  * config + filterQuery
  * a single derived rows stream/store
* Orchestrates adapter calls:

  * load roots/children/pages
  * apply results back into engine
* Cancellation:

  * **AbortController** for in-flight loads
  * on filter/config/adapter change: abort + reset appropriate engine state
* Page-aware detection:

  * primary signal: CDK rendered range events
  * engine computes missing pages → service triggers adapter loads

Use browser primitives where they reduce code:

* `AbortController` always
* `ResizeObserver` only if needed for viewport recalcs beyond CDK signals

### Acceptance criteria

* No adapter calls inside components.
* Rapid filter changes do not apply stale results (aborted requests never commit).
* Range ensure loads correct pages near end-of-list.

### Verification

```bash
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer test
```

Story checklist to validate in this phase:

* Virtual scroll/Page aware
* Filtering (100+ elements)

---

## Phase 4 — TreeExplorerComponent (Covalent wrapper, usage unchanged)

### Work

Implement/reshape `TreeExplorerComponent`:

* Covalent-facing API must remain unchanged:

  * same selector, inputs, outputs, and expected behaviors
* Responsibilities:

  * render rows from service
  * forward intents:

    * expand/collapse
    * selection
    * renderedRange updates (CDK)
    * keyboard navigation events
    * context menu actions
    * pinned navigation intents
* Keyboard navigation:

  * focus management + ARIA basics (as currently expected)
  * delegate state changes to service/engine
* Context menu:

  * centralized ownership stays in component
  * action execution emits events; does not perform domain logic

Angular 20+ usage (lightweight):

* `inject()` for service
* use signals only for input binding convenience if it reduces glue
* avoid building a signal-heavy store; keep state in service + engine outputs

### Acceptance criteria

* Component contains no domain branching and no adapter calls.
* Keyboard navigation works in Storybook (tab/focus/arrow/enter/space).
* Context menu actions are consistent and config-driven.

### Verification

```bash
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer storybook:build
```

Stories to validate:

* Basic Usage
* Virtual scroll
* Virtual scroll/Page aware
* Pinned items

---

## Phase 5 — Storybook + mocks consolidation (compact but complete)

### Work

* Move all fixtures to `testing/mocks`.
* Create a small shared harness in `testing/stories/_harness`:

  * createAdapter helpers
  * deterministic delay helpers
  * page-aware fake API
  * reusable story decorators/args
* Keep story set minimal but covering required categories.

### Acceptance criteria

* No repeated mock pagination logic across stories.
* All required story categories exist and are deterministic.

### Verification

```bash
pnpm -C /home/rocker/LABS/tree-explorer storybook:build
```

---

## Phase 6 — Remove async-tree component entirely

### Work

* Delete async-tree component code and exports.
* Update docs and stories to reference TreeExplorer only.
* Add a short migration note: “async-tree → TreeExplorer”.

### Acceptance criteria

* `rg "async-tree|AsyncTree"` returns no results across repo.

### Verification

```bash
rg -n "async-tree|AsyncTree|asyncTree" /home/rocker/LABS/tree-explorer && exit 1 || true
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer storybook:build
```

---

## Final acceptance checklist (must be green)

### Features

* Virtual scroll + page-aware detection
* Range-loading correctness (no missing pages under rapid scrolling)
* Keyboard navigation (a11y)
* Config toggles:

  * virtual scroll, page-aware, selection, context menu, pinned
* Strict adapter boundary
* DS separation (no domain logic in components)
* TreeExplorer is the only entry point (async-tree removed)

### Commands

```bash
pnpm -C /home/rocker/LABS/tree-explorer build
pnpm -C /home/rocker/LABS/tree-explorer test
pnpm -C /home/rocker/LABS/tree-explorer storybook:build
```

---

## Pitfalls (do NOT do these)

* Do not call APIs inside components.
* Do not bypass TreeEngine transitions by mutating node objects directly.
* Do not keep parallel caches of visible rows in multiple layers.
* Do not rely on unstable IDs (virtualization + selection will break).
* Do not move filtering semantics into UI; adapter owns matching rules.
* Do not make pinned navigation “best effort” without adapter.resolvePathToNode; failures must emit TreeLoadError.

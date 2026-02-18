# Spec-Driven Refactor Guide

> A step-by-step process guide for refactoring the Project A adapter + component
> into the best-in-class library implementation represented in Project B.

---

## 4.1 Spec Artifacts to Create

### 4.1.1 Feature Spec Template

Create one per feature. File naming: `specs/features/<feature-name>.spec.md`

```markdown
# Feature Spec: [Feature Name]

## Motivation
Why this feature exists. What user problem it solves.

## UX Constraints
- [ ] Must not block UI thread for >16ms on any user interaction
- [ ] Must provide visual feedback within 100ms of user action
- [ ] Must degrade gracefully when data is unavailable
- [ ] [Additional feature-specific constraints]

## API Surface

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| | | | |

### Outputs
| Output | Type | Description |
|--------|------|-------------|
| | | |

### Config
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| | | | |

## Invariants
- [ ] [State invariant 1: e.g., "expanded set never contains leaf node IDs"]
- [ ] [State invariant 2]

## Failure Modes
| Failure | Detection | Recovery | User-visible effect |
|---------|-----------|----------|---------------------|
| | | | |

## Acceptance Criteria
See Section 4.2 for given/when/then format.

## Story Coverage
| Story file | Story name | What it verifies |
|------------|------------|------------------|
| | | |

## Test Coverage
| Test file | Test name pattern | What it verifies |
|-----------|-------------------|------------------|
| | | |

## Performance Assertions
| Metric | Budget | Measurement method |
|--------|--------|--------------------|
| | | |
```

---

### 4.1.2 Adapter Contract Spec Template

File: `specs/adapter-contract.spec.md`

```markdown
# Adapter Contract Spec

## Required Methods

| Method | Signature | Postconditions | Perf expectation |
|--------|-----------|----------------|------------------|
| `getId` | `(source: TSource) => string` | Must return stable, unique ID across calls for same source. Must be O(1). | <1μs |
| `getLabel` | `(data: T) => string` | Must return displayable string. Must be O(1). | <1μs |

## Optional Loading Methods

| Method | Signature | When called | Postconditions | Cancellation |
|--------|-----------|-------------|----------------|--------------|
| `getChildren` | `(data: T) => TSource[] \| null \| undefined` | On expand, when sync children are available | Returns immediate children or null | N/A (sync) |
| `loadChildren` | `(node, reqOrSource?, data?) => Promise<TSource[] \| PageResult>` | On expand (first load), on page request | Resolves with children array or PageResult. Must not throw for recoverable errors (return empty). | Adapter-owned. Recommended: AbortController pattern. |
| `hasChildren` | `(data: T) => boolean \| undefined` | On node render (expand caret decision) | `true` shows caret, `false` hides caret, `undefined` defers to heuristic | N/A |
| `isLeaf` | `(data: T, ctx?: TreeLeafContext) => boolean \| undefined` | On projection computation | Overrides default leaf heuristic. Takes precedence over `hasChildren`. | N/A |

## Optional Pagination Methods

| Method | Signature | When called | Postconditions |
|--------|-----------|-------------|----------------|
| `getPagination` | `(node: TreeNode<T>, data?: T) => TreePaginationConfig \| undefined` | On expand, per parent | Returns pagination config for this parent or undefined (not paged). |
| `loadChildren` (paged overload) | `(node, req: PageRequest, data?) => Promise<PageResult<TSource>>` | On page request from ensureRangeLoaded | Must return `{ items, totalCount }`. `totalCount` must be ≥ items.length. |

## Optional Filtering Methods

| Method | Signature | When called | Postconditions |
|--------|-----------|-------------|----------------|
| `matches` | `(data: T, query: TreeFilterQuery) => boolean` | On filter application per node | If provided, overrides default text matching. Must be O(1) or O(label length). |
| `getSearchText` | `(data: T) => string` | On filter application when `matches` not provided | Returns searchable text. Default: uses label. |
| `highlightRanges` | `(label, query) => TreeMatchRange[] \| undefined` | On row projection | Returns explicit character ranges for highlighting. Overrides auto-highlight. |

## Optional Navigation Methods

| Method | Signature | When called | Postconditions |
|--------|-----------|-------------|----------------|
| `resolvePathToNode` | `(targetId: TreeId) => TreeResolvePathResponse` | On pinned item click (for unloaded targets) | Returns root→target path steps with optional pageHints. Must not hang; must resolve or reject within timeout. |

## Caching Policy
- Adapters should cache API responses externally if data is expensive to fetch.
- Engine does not cache adapter call results; it caches projected state.
- Adapter `getId` and `getLabel` are called frequently (once per node per projection recompute); keep them allocation-free.

## Error Semantics
| Error source | How adapter signals it | How engine/service handles it |
|--------------|----------------------|-------------------------------|
| Root load failure | `setSources` rejects or throws | Service emits `rootError`; component emits `loadError` with `scope='root'` |
| Child load failure | `loadChildren` rejects | Service emits `lastError`; per-node error state set |
| Page load failure | `loadChildren` (paged) rejects | Per-page error tracked; `setPageError` called; retry targets only failed page |
| Path resolution failure | `resolvePathToNode` rejects | `TreeLoadError(scope='navigation', reason='path-resolution-failed')` |
| Path unavailable | `resolvePathToNode` not implemented | `TreeLoadError(scope='navigation', reason='path-unavailable')` |
```

---

### 4.1.3 Engine Invariants Spec Template

File: `specs/engine-invariants.spec.md`

```markdown
# Engine Invariants Spec

## Single Source of Truth
- [ ] `TreeEngine.state` is the sole authority for node graph, expansion, selection, loading, and error states.
- [ ] No external mutation of `state.nodes`, `state.expanded`, `state.selected`, `state.loading`, `state.errors` is permitted.
- [ ] All state transitions go through named functions in engine sub-modules (expansion.ts, selection.ts, paging.ts, loading.ts).

## Deterministic State Transitions
- [ ] Same sequence of API calls on same initial state produces identical final state.
- [ ] `getFilteredFlatList` with same adapter + config + state returns same `TreeRowViewModel[]` reference (cache hit).
- [ ] Projection cache key dimensions: adapter ref, nodesRef, expandedRef, selectedRef, loadingRef, errorsRef, filterFingerprint, filterConfigFingerprint, pagingVersion.
- [ ] Cache invalidation is triggered by state reference changes only (immutable update pattern).

## Paging / Range Correctness
- [ ] Placeholder IDs are deterministic: `__tree_placeholder__<parentId>__<index>`.
- [ ] Placeholder count for parent equals `totalCount` from last successful page response.
- [ ] `ensureRangeLoaded(parent, {start, end})` returns only page indices for unloaded, non-in-flight, non-errored pages.
- [ ] `applyPagedChildren` updates only affected indices; does not reconstruct full child array when totalCount is unchanged.
- [ ] In-flight dedupe: a (parentId, pageIndex) pair that is already in-flight is never re-requested.
- [ ] Paging can be disabled at runtime (shouldDisablePaging: when first page returns all items).

## Selection Correctness
- [ ] `selectOne` clears all other selections.
- [ ] `selectToggle` in single-mode behaves like `selectOne`.
- [ ] `selectRange` operates over filtered rows when adapter+config provided, structural order otherwise.
- [ ] Branch select includes all descendants of target node.
- [ ] Placeholder nodes are never selectable.
- [ ] Disabled nodes are never selectable (when `isSelectionAllowed` returns false).

## Filtering Correctness
- [ ] Active filter query is normalized (trimmed, lowered unless caseSensitive).
- [ ] `showParentsOfMatches` includes all loaded ancestors of matching nodes.
- [ ] `autoExpandMatches` only expands loaded ancestors (does not trigger loads).
- [ ] `selectionPolicy='clearHidden'` removes selections for nodes that become invisible.
- [ ] In `server` mode, core does NOT run `matches` or auto-highlight.
- [ ] `adapter.isVisible(data) === false` hides node regardless of filter match.

## Navigation Correctness
- [ ] `expandPath(nodeId)` only operates on already-loaded nodes.
- [ ] `navigateToNode(nodeId)` resolves unloaded paths via `adapter.resolvePathToNode`.
- [ ] Navigation failure produces `TreeLoadError(scope='navigation')` without leaving engine in inconsistent state.
- [ ] Navigation does not create infinite load loops.
```

---

### 4.1.4 Config Spec Template

File: `specs/config.spec.md`

```markdown
# Config Spec

## Keys

| Key path | Type | Default | Compatibility | Notes |
|----------|------|---------|---------------|-------|
| `selection.mode` | `'single' \| 'multi' \| 'none'` | `'none'` | — | |
| `selection.hierarchical` | `boolean` | `false` | Requires `mode: 'multi'` | |
| `virtualization.mode` | `'auto' \| 'always' \| 'none'` | `'auto'` | — | `'auto'` enables when data exceeds viewport |
| `virtualization.itemSize` | `number` | `36` | Must match `--tree-row-height` | |
| `filtering.mode` | `'client' \| 'hybrid' \| 'server'` | `'client'` | — | |
| `filtering.showParentsOfMatches` | `boolean` | `true` | — | |
| `filtering.autoExpandMatches` | `boolean` | `false` | — | |
| `filtering.selectionPolicy` | `'keep' \| 'clearHidden'` | `'keep'` | — | |
| `filtering.keepPlaceholdersVisible` | `boolean` | `true` | — | |
| `pinned.enabled` | `boolean` | `false` | — | |
| `pinned.label` | `string` | `'Pinned'` | — | |
| `pinned.entries` | `TreePinnedEntry[]` | `[]` | — | |
| `pinned.store` | `TreePinnedStore<T>` | `undefined` | — | |
| `pinned.maxItems` | `number` | `undefined` | — | |
| `pinned.dnd.enabled` | `boolean` | `false` | — | |
| `actions` | `TreeContextAction<T>[]` | `[]` | — | |
| `defaultIcon` | `string` | `undefined` | — | |
| `density` | `'standard' \| 'compact' \| 'comfortable'` | `'standard'` | — | |

## satisfies-friendly typing

```ts
const config = {
  selection: { mode: 'multi' as const },
  virtualization: { mode: 'auto' as const, itemSize: 36 },
  filtering: { mode: 'client' as const, showParentsOfMatches: true },
} satisfies Partial<TreeConfig<MyNode>>;
```

## Incompatible combinations
| Combination | Behavior |
|-------------|----------|
| `selection.hierarchical: true` + `selection.mode: 'single'` | Hierarchical is ignored in single mode |
| `virtualization.mode: 'none'` + page-aware adapter | Paging still works but scroll performance degrades |
| `filtering.autoExpandMatches: true` + large loaded graph | Can cause layout thrash; use with caution |
```

---

### 4.1.5 Accessibility Spec Template

File: `specs/accessibility.spec.md`

```markdown
# Accessibility Spec

## Keyboard Navigation

| Key | Context | Action | Focus behavior |
|-----|---------|--------|----------------|
| `ArrowDown` | Tree focused | Move focus to next visible row | Focus ring moves; scroll if needed |
| `ArrowUp` | Tree focused | Move focus to previous visible row | Focus ring moves; scroll if needed |
| `ArrowRight` | Collapsed node | Expand node | Focus stays on node |
| `ArrowRight` | Expanded node | Move focus to first child | Focus moves down |
| `ArrowLeft` | Expanded node | Collapse node | Focus stays on node |
| `ArrowLeft` | Collapsed/leaf node | Move focus to parent | Focus moves up |
| `Enter` | Any row | Activate (click) | Depends on selection mode |
| `Space` | Any row (multi-select) | Toggle selection | Focus stays |
| `Home` | Tree focused | Move focus to first row | Scroll to top |
| `End` | Tree focused | Move focus to last row | Scroll to bottom |
| `*` | Tree focused | Expand all siblings | Focus stays |

## Focus Management
- [ ] Tree container is focusable (`tabindex="0"`)
- [ ] Active descendant pattern (`aria-activedescendant`) for virtual scroll
- [ ] Focus restored after expand/collapse re-render
- [ ] Focus restored after filter change (to nearest visible row or first row)
- [ ] Focus trap does NOT capture focus (tree is not a dialog)

## ARIA Roles and Properties (target state)
- [ ] Container: `role="tree"`
- [ ] Each visible row: `role="treeitem"`
- [ ] `aria-expanded="true/false"` on expandable nodes
- [ ] `aria-selected="true/false"` on selectable nodes
- [ ] `aria-level="<N>"` for nesting depth
- [ ] `aria-setsize` + `aria-posinset` for sibling count and position
- [ ] Placeholder rows: `aria-hidden="true"`
- [ ] Loading rows: `aria-busy="true"`
```

---

### 4.1.6 Performance Budget Spec Template

File: `specs/performance-budget.spec.md`

```markdown
# Performance Budget Spec

## Measurable Budgets

| Operation | Budget | Dataset | Measurement |
|-----------|--------|---------|-------------|
| Initial render (visible rows) | <100ms | 1,000 visible rows | `performance.mark` around `ngAfterViewInit` |
| Expand + first page load (UI response) | <200ms | 50-item page | Mark around `toggleExpand` → first row render |
| Filter recompute | <50ms | 10,000 loaded nodes | `performance.measure` around `setFilter` |
| Projection cache hit | <1ms | Any size | `performance.measure` around `getFilteredFlatList` when no state change |
| Page patch (steady-state) | <10ms | 50-item page into 10K-child parent | Mark around `applyPagedChildren` |
| Range scheduling | <5ms | 100-page parent | Mark around `ensureRangeLoaded` |
| Selection toggle (single) | <5ms | Any size | Mark around `selectToggle` |
| Selection range | <20ms | 1,000-row range | Mark around `selectRange` |

## Instrumentation Hooks

```ts
interface TreePerfObserver {
  onProjectionCacheHit?(duration: number): void;
  onProjectionCacheMiss?(duration: number, nodeCount: number): void;
  onFilterRecompute?(duration: number, nodeCount: number, matchCount: number): void;
  onPageSchedule?(duration: number, pageCount: number): void;
  onPagePatch?(duration: number, itemCount: number): void;
}
```

## Anti-patterns to detect
- Projection recompute on every `renderedRangeStream` emission (should be cache hit)
- `getFilteredFlatList` called with different adapter reference on each frame (breaks cache)
- `matches()` allocating objects per call (should be stateless computation)
- Adapter `getId` or `getLabel` doing async or heavy computation
```

---

## 4.2 Acceptance Criteria (Given/When/Then)

### Feature: Virtual Scrolling

```gherkin
Scenario: Visible rows rendered on initial load
  Given a tree with 10,000 flat nodes
  And virtualization mode is 'auto'
  And itemSize is 36
  When the component initializes
  Then only rows intersecting the viewport are rendered
  And the viewport height matches container height
  And scrollbar height corresponds to total row count × itemSize

Scenario: Scrolling renders new rows
  Given a virtualized tree is displayed
  When the user scrolls down by 500px
  Then rows for the new viewport range are rendered
  And previously out-of-range rows are recycled

Story coverage: tree-explorer.virtual-scroll.stories.ts
Unit test: tree-explorer.component.spec.ts ("should render only visible rows")
Perf: initial render <100ms for 1K visible
```

### Feature: Page-Aware Loading

```gherkin
Scenario: First expand triggers first page load
  Given a parent node with getPagination returning pageSize=50
  When the user expands the parent
  Then loadChildren is called with pageIndex=0, pageSize=50
  And placeholder rows appear for totalCount - loaded items
  And loaded items replace placeholders in their positions

Scenario: Scrolling triggers range load
  Given a parent with 500 children, page 0 loaded
  When the viewport scrolls to show rows 100-120
  Then ensureRangeLoaded computes pages [2] (for 50-size pages)
  And loadChildren is called for page 2 only
  And page 2 items replace their placeholders

Scenario: Page load failure is scoped
  Given pages 0 and 1 are loaded
  When page 2 load fails
  Then page 2 placeholders remain
  And pages 0 and 1 remain displayed
  And retry targets page 2 only

Story coverage: tree-explorer.page-aware.stories.ts
Unit test: paging.spec.ts, tree.service.spec.ts
Perf: page patch <10ms per page
```

### Feature: Filtering

```gherkin
Scenario: Client filter reduces visible rows
  Given a tree with 100 nodes loaded
  And filtering mode is 'client'
  When filterQuery is set to { text: 'budget' }
  Then only nodes matching 'budget' (via adapter.matches or label contains) are visible
  And their ancestors are visible (showParentsOfMatches=true)
  And non-matching leaf nodes are hidden

Scenario: Clear filter restores full tree
  Given a filter is active
  When clearFilter is called
  Then all originally visible nodes are restored
  And expansion state is preserved

Scenario: Highlight ranges shown
  Given a filter is active with query 'bud'
  When matched rows are rendered
  Then labels show <mark> tags around 'bud' substring
  And mark styling uses --tree-highlight-* CSS variables

Story coverage: tree-explorer.filtering-cookbook.stories.ts
Unit test: visibility.spec.ts, highlight-filter.pipe.spec.ts
Perf: filter recompute <50ms for 10K loaded nodes
```

### Feature: Pinned Items

```gherkin
Scenario: Pin a node via context menu
  Given pinned config is enabled with a store
  When user right-clicks node and selects "Star"
  Then store.addPinned is called
  And pinned section shows the new entry

Scenario: Navigate to unloaded pinned target
  Given a pinned entry pointing to a deep unloaded node
  And adapter implements resolvePathToNode
  When user clicks the pinned entry
  Then resolvePathToNode is called
  And each path step is expanded and loaded
  And the target node is selected and scrolled into view

Scenario: Navigation failure
  Given a pinned entry pointing to a removed node
  When user clicks the pinned entry
  Then loadError is emitted with scope='navigation'
  And the tree remains stable
  And no infinite loading spinner appears

Story coverage: tree-explorer.pinned-cookbook.stories.ts
Unit test: tree.service.spec.ts ("navigateToNode")
```

### Feature: Keyboard Navigation

```gherkin
Scenario: Arrow key traversal
  Given a tree with expanded nodes
  When user presses ArrowDown
  Then focus moves to next visible row
  And the row is scrolled into view if needed

Scenario: Expand via keyboard
  Given focus is on a collapsed parent
  When user presses ArrowRight
  Then the node expands
  And focus stays on the same node

Scenario: Collapse via keyboard
  Given focus is on an expanded parent
  When user presses ArrowLeft
  Then the node collapses
  And focus stays on the same node

Story coverage: tree-explorer.advanced.stories.ts
Manual check: screen reader announces tree items and expansion state
```

### Feature: Selection

```gherkin
Scenario: Single select replaces previous
  Given selection mode is 'single'
  And node A is selected
  When user clicks node B
  Then node B is selected
  And node A is deselected
  And selectionChange emits [B]

Scenario: Multi select toggle
  Given selection mode is 'multi'
  And nodes A and B are selected
  When user clicks node A
  Then node A is deselected
  And node B remains selected
  And selectionChange emits [B]

Scenario: Range select
  Given selection mode is 'multi'
  And node A is selected
  When user shift-clicks node D
  Then all visible rows between A and D are selected

Story coverage: tree-explorer.advanced.stories.ts
Unit test: selection.spec.ts
```

---

## 4.3 Execution Plan (Incremental Refactor Steps)

### Step 0: Establish Baselines

```bash
# Capture current metrics
pnpm typecheck                    # Must pass
pnpm build                        # Must pass
pnpm --filter @tree-core test     # Record pass/fail count
pnpm --filter @tree-explorer test # Record pass/fail count
pnpm storybook:build              # Must succeed

# Record LOC baselines
# Record story list (pnpm storybook --dry-run or grep .stories.ts)
# Record export surface (grep "^export " in public-api.ts files)
```

### Step 1: Spec Authoring (no code changes)

1. Create `specs/` directory at repo root
2. Author all spec files from Section 4.1 templates
3. Review specs with team (1 review cycle)
4. Commit specs as "spec: add feature/adapter/engine/config/a11y/perf specs"
5. **Gate:** All spec files committed and reviewed before any code change

### Step 2: Engine Invariant Hardening

Scope: `packages/tree-core/src/lib/engine/`

1. Add missing engine spec cases from invariants spec
2. Fix pre-existing paging test failure (`ensureRangeLoadedPages` range calculation)
3. Add projection cache consistency test (getFilteredFlatList ↔ getRowViewModelsById)
4. Add navigation error isolation test
5. **Gate:** `pnpm --filter @tree-core test` — all pass, zero failures

### Step 3: Explicit Exports Map

Scope: `packages/tree-core/package.json`, `packages/tree-explorer/package.json`

1. Add `exports` field to both package.json files
2. Add `@internal` JSDoc to engine sub-module functions
3. Add lint rule (or eslint-plugin-boundaries config) to prevent cross-boundary imports
4. **Gate:** `pnpm typecheck` + `pnpm build` pass. No consumer changes needed.

### Step 4: ARIA Tree Role Compliance

Scope: `packages/tree-explorer/src/lib/components/`

1. Add `role="tree"` to viewport container in tree-explorer.component.html
2. Add `role="treeitem"`, `aria-expanded`, `aria-selected`, `aria-level` to tree-item.component.html
3. Add `aria-activedescendant` pattern to tree-explorer.component.ts
4. Add `aria-hidden="true"` to placeholder rows
5. Add spec test for ARIA attributes
6. **Gate:** `pnpm typecheck` + `pnpm build` + `pnpm --filter @tree-explorer test` pass. Manual screen reader check.

### Step 5: Signal-First DS Layer

Scope: `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`

1. Replace `effect()` + `set()` patterns with `computed()` and `linkedSignal()` where applicable
2. Remove manual `effectRef` tracking
3. Verify all existing stories still work
4. **Gate:** `pnpm typecheck` + `pnpm --filter @tree-explorer test` + `pnpm storybook:build`

### Step 6: CSS Selector Deduplication

Scope: `packages/tree-explorer/src/lib/components/tree-item/tree-item.component.scss`

1. Replace repeated state selectors with `:where()` / `:is()`
2. Deduplicate shared property blocks
3. Visual regression check in Storybook
4. **Gate:** `pnpm storybook:build` + visual inspection of all stories

### Step 7: Unified Projection Computation

Scope: `packages/tree-core/src/lib/engine/tree-engine.ts`, `visibility.ts`

1. Consolidate `getFilteredFlatList` and `getRowViewModelsById` to use single `computeProjection()` entry point
2. Ensure cache key dimensions are identical for both paths
3. Add spec verifying consistency between the two read APIs
4. **Gate:** `pnpm --filter @tree-core test` — all pass

### Step 8: AbortController Cancellation

Scope: `packages/tree-core/src/lib/types/tree-adapter.ts`, `packages/tree-explorer/src/lib/services/tree.service.ts`

1. Add optional `signal?: AbortSignal` parameter to `loadChildren` in adapter type
2. Implement AbortController lifecycle in TreeStateService (create on expand, cancel on collapse/re-expand)
3. Add spec for cancellation behavior
4. **Gate:** `pnpm typecheck` + `pnpm --filter @tree-core test` + `pnpm --filter @tree-explorer test`

### Step 9: Config Types Refinement

Scope: `packages/tree-core/src/lib/types/tree-config.ts`

1. Apply `satisfies` to `DEFAULT_TREE_CONFIG` and `DEFAULT_TREE_FILTERING_CONFIG`
2. Add discriminated union narrowing for `filtering.mode`
3. **Gate:** `pnpm typecheck`

### Step 10: Documentation Rewrite

Scope: `docs/`, package READMEs

1. Implement docs layout from Phase 2 proposal
2. Rewrite each section to match implemented reality
3. Run `pnpm docs:check`
4. **Gate:** All doc links resolve. Content matches code.

---

## 4.4 Verification Checklist Per Step

### Universal Checklist (Run After Every Step)

```bash
# Type safety
pnpm typecheck

# Build
pnpm build

# Unit tests
$env:CHROME_BIN = "$(node -e "process.stdout.write(require('puppeteer').executablePath())")"
pnpm exec ng test tree-core --watch=false --browsers=ChromeHeadless --no-progress
pnpm exec ng test tree-explorer --watch=false --browsers=ChromeHeadless --no-progress

# Storybook build
pnpm storybook:build
```

### Stories to Validate Per Feature Area

| Feature area | Stories to check |
|-------------|------------------|
| Virtual scroll | `Tree/Virtual scroll` group |
| Page-aware | `Tree/Virtual scroll/Page aware`, `Page aware nested`, `Page aware three level` |
| Filtering | `Tree/Filtering (100+ elements)` group |
| Pinned items | `Tree/Pinned items` group |
| Errors | `Tree/Errors & edge cases` group |
| Basic/advanced | `Tree/Basic Usage`, `Tree/Advanced` groups |

### Manual A11y Checks (Steps 4, 5)

- [ ] Tab to tree: focus ring visible on container
- [ ] ArrowDown: focus moves to next row, announced by screen reader
- [ ] ArrowRight on collapsed: node expands, screen reader announces "expanded"
- [ ] ArrowLeft on expanded: node collapses, screen reader announces "collapsed"
- [ ] Enter: node activated (click event fires)
- [ ] Space in multi-select: selection toggled
- [ ] Placeholder rows not announced by screen reader
- [ ] Loading state announced as "loading" or "busy"

### Regression Traps to Watch

| Trap | What to check | How to detect |
|------|---------------|---------------|
| Page-aware edge near end-of-list | Last page may be partial; verify no phantom rows after last real item | Expand paged parent, scroll to end, verify row count matches totalCount |
| Rapid filter changes | Debounce may drop intermediate queries; verify final result is correct | Type fast in filter input, verify final visible rows match last query |
| Cancellation correctness | Stale load result from cancelled request may overwrite fresh result | Expand → collapse → expand same node rapidly; verify final children are from second load |
| Projection cache key drift | Adding a new state dimension without updating cache key | After new state dimension added, verify `getFilteredFlatList` returns fresh results when that dimension changes |
| Pinned navigation with paged parent | Page hint must be correct for target's parent | Pin a node deep inside a paged branch; navigate to it; verify correct page is loaded |
| Selection after filter clear | Selection state must be restored for previously hidden nodes | Select nodes, apply filter (hides some), clear filter, verify selection restored |
| Virtualization + expand/collapse | Viewport range must be recalculated after expand/collapse changes total height | Expand large branch in middle of tree, verify no blank areas below |

---

## Appendix: Recommended Commit Message Format

```
<type>(<scope>): <one-line summary>

<optional body with context>

Specs: <spec file(s) this addresses>
Gate: <command(s) that must pass>
```

Types: `spec`, `refactor`, `fix`, `feat`, `docs`, `test`, `perf`, `style`

Example:
```
refactor(engine): unify projection computation entry point

Consolidates getFilteredFlatList and getRowViewModelsById to use a single
computeProjection() call with shared cache key dimensions.

Specs: specs/engine-invariants.spec.md (projection cache section)
Gate: pnpm typecheck && pnpm --filter @tree-core test
```

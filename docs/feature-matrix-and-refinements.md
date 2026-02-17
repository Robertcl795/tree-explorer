# Feature Matrix & Library Refinement Proposal

---

## 3.1 Feature Matrix

| # | Feature | Status | Owner | Config toggle | Config key | Story coverage | Perf notes | A11y notes |
|---|---------|--------|-------|---------------|------------|----------------|------------|------------|
| 1 | Virtual scrolling (CDK) | ✅ Implemented | Engine + DS layer | Yes | `virtualization.mode` ('auto'/'always'/'none') | `tree-explorer.virtual-scroll.stories.ts` | O(visible) render; stable trackBy | — |
| 2 | Page-aware lazy loading | ✅ Implemented | Engine + Adapter | Yes | `adapter.getPagination()` per node | `tree-explorer.page-aware*.stories.ts` | O(p) page scheduling; O(k) steady-state patch | — |
| 3 | Placeholder geometry | ✅ Implemented | Engine | Implicit (active when paging) | — | Page-aware stories | Deterministic IDs (`__tree_placeholder__`); disabled + non-selectable | Placeholders are `aria-hidden` or have placeholder role |
| 4 | Range-based page fetch | ✅ Implemented | Engine | Implicit (on viewport range change) | — | Page-aware stories | In-flight dedupe by (parentId, pageIndex) | — |
| 5 | Per-page error tracking | ✅ Implemented | Engine | No | `setPageError`/`clearPageError` API | `tree-explorer.errors-edge-cases.stories.ts` | Per-page retry avoids full refetch | — |
| 6 | Expand / collapse | ✅ Implemented | Engine | No | — | All stories | Map/set state transitions | — |
| 7 | Single selection | ✅ Implemented | Engine | Yes | `selection.mode: 'single'` | Advanced stories | O(1) state update | — |
| 8 | Multi selection | ✅ Implemented | Engine | Yes | `selection.mode: 'multi'` | Advanced stories | Map-based; range select over filtered or structural order | — |
| 9 | Hierarchical selection | ✅ Implemented | Engine | Yes | `selection.hierarchical` | Advanced stories | O(subtree) for branch operations | — |
| 10 | Range select | ✅ Implemented | Engine | Implicit (multi mode) | — | Advanced stories | Uses flattened or filtered order | — |
| 11 | Branch select | ✅ Implemented | Engine | Implicit (multi mode) | — | Advanced stories | O(subtree) | — |
| 12 | Client filtering | ✅ Implemented | Engine + Adapter | Yes | `filtering.mode: 'client'` | `tree-explorer.filtering-cookbook.stories.ts` | O(n) on loaded nodes per query change | — |
| 13 | Hybrid filtering | ✅ Implemented | Engine + Adapter | Yes | `filtering.mode: 'hybrid'` | Filtering stories | Client for loaded; wrapper orchestrates deeper loads | — |
| 14 | Server filtering | ✅ Implemented | Engine + Adapter | Yes | `filtering.mode: 'server'` | Filtering stories | Core skips matching; adapter/API owns filtering | — |
| 15 | Show parents of matches | ✅ Implemented | Engine | Yes | `filtering.showParentsOfMatches` | Filtering stories | Collects ancestor IDs for visibility | — |
| 16 | Auto-expand matches | ✅ Implemented | Engine | Yes | `filtering.autoExpandMatches` | Filtering stories | Mutates expansion state; loaded-graph only | — |
| 17 | Clear hidden selections | ✅ Implemented | Engine | Yes | `filtering.selectionPolicy: 'clearHidden'` | — | — | — |
| 18 | Adapter-owned match semantics | ✅ Implemented | Adapter | No | `adapter.matches(data, query)` | Filtering stories | Adapter controls matching complexity | — |
| 19 | Highlight ranges (pipe) | ✅ Implemented | DS layer (pipe) | No | `adapter.highlightRanges` or auto from query | Filtering stories | Pure pipe; `<mark>` rendering with CSS vars | — |
| 20 | Context menu (actions) | ✅ Implemented | DS layer (component) | Yes | `config.actions` | Advanced stories | Container-level ownership only | — |
| 21 | Pinned items | ✅ Implemented | Engine + DS layer | Yes | `pinned.enabled`, `pinned.entries`, `pinned.store` | `tree-explorer.pinned-cookbook.stories.ts` | — | — |
| 22 | Pinned DnD reorder | ✅ Implemented | DS layer | Yes | `pinned.dnd.enabled` | Pinned stories | CDK DragDrop | — |
| 23 | Pinned async navigation | ✅ Implemented | Service + Adapter | Yes | `adapter.resolvePathToNode` | Pinned stories | Path resolution + multi-step load + expand | — |
| 24 | Pinned persistence hooks | ✅ Implemented | Adapter (store) | Yes | `pinned.store` (load/add/remove/reorder) | Pinned stories | — | — |
| 25 | Keyboard navigation | ⚠️ Partial | DS layer | No | — | Advanced stories | Arrow keys, Enter, focus management | Focus management exists but lacks full ARIA tree pattern |
| 26 | ARIA tree role compliance | ⚠️ Partial | DS layer | No | — | — | — | Missing `role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level` on all rows |
| 27 | Drag & drop (tree items) | ✅ Implemented | DS layer + Adapter | Optional | `adapter.getDragData` + outputs | Advanced stories | — | — |
| 28 | isLeaf precedence | ✅ Implemented | Engine | No | `adapter.isLeaf(data, ctx?)` | Visibility specs | 3-level fallback: adapter → node → heuristic | — |
| 29 | isVisible gating | ✅ Implemented | Engine + Adapter | No | `adapter.isVisible(data)` | — | Baseline visibility independent of filter | — |
| 30 | Root loading state | ✅ Implemented | Service | No | — | Error stories | Signal-based `rootLoading`, `rootLoadError` | — |
| 31 | Navigation error reporting | ✅ Implemented | Service | No | — | Error stories | `TreeLoadError(scope='navigation')` | — |
| 32 | CSS theming contract | ✅ Implemented | DS layer | No | 66 `--tree-*` CSS variables | — | — | High-contrast via token overrides |
| 33 | Backward-compat wrappers | ✅ Implemented | DS layer | No | `<async-tree>`, `<td-tree>` selectors | — | Thin delegation, no extra overhead | — |
| 34 | NgModule compat | ✅ Implemented | DS layer | No | `TreeExplorerModule.forRoot()` | — | — | — |
| 35 | Projection caching | ✅ Implemented | Engine | No | — | — | O(1) repeated reads; multi-dimension cache key | — |
| 36 | Flattening caching | ✅ Implemented | Engine | No | — | — | Memoized by (nodesRef, expandedRef) | — |
| 37 | Object tree adapter (utility) | ✅ Implemented | Utils | No | — | — | Simple id/name/children default adapter | — |
| 38 | AbortController cancellation | ❌ Missing | — | — | — | — | Adapter must implement own; no engine support | — |
| 39 | ResizeObserver viewport | ❌ Missing | — | — | — | — | Viewport relies on CDK scroll; no dynamic resize handling | — |
| 40 | Presets (FileExplorer, OrgChart, etc.) | ❌ Missing (stubs) | — | — | `presets/index.ts` | — | TODO stubs only | — |
| 41 | Perf instrumentation | ❌ Missing | — | — | — | — | Manual only; no built-in counters | — |
| 42 | shouldDisablePaging optimization | ✅ Implemented (B only) | Service | No | — | — | Auto-disables paging when first page returns all items | — |

---

## 3.2 Library Refinement Proposals

### Proposal 1: AbortController-driven cancellation in engine load pipeline

| Aspect | Detail |
|--------|--------|
| **What to change** | Add `AbortSignal` parameter to `loadChildren` adapter method. Engine/service creates `AbortController` per parent expansion, cancels previous on re-expand or collapse. |
| **Why** | Prevents stale data from slow loads overwriting fresh results; reduces wasted network/compute for cancelled operations. |
| **Risk** | Low — additive change. Existing adapters without signal param continue working (optional param). |
| **How to verify** | Unit test: expand → collapse → expand should cancel first load. Story: rapid expand/collapse with delay mock. |
| **LOC impact** | ↑ ~60 LOC (engine changes + adapter type update) |

### Proposal 2: ResizeObserver-based viewport recalculation

| Aspect | Detail |
|--------|--------|
| **What to change** | Add `ResizeObserver` on tree-explorer host element to detect container resize and trigger viewport recalculation. Currently relies on CDK's scroll event only. |
| **Why** | Handles dynamic container resize (panels, accordion, responsive layouts) without requiring manual viewport refresh. |
| **Risk** | Low — `ResizeObserver` is available in all modern browsers. Need `ngOnDestroy` cleanup. |
| **How to verify** | Story with resizable container; verify no clipped/missing rows after resize. |
| **LOC impact** | ↑ ~30 LOC |

### Proposal 3: Unify projection computation — eliminate parallel caches

| Aspect | Detail |
|--------|--------|
| **What to change** | Currently `getFilteredFlatList` and `getRowViewModelsById` maintain a shared `TreeProjectionCache` but the projection is recomputed from different entry points. Unify into a single `computeProjection()` call gated by the multi-dimension cache key, and derive both outputs from it. |
| **Why** | Reduces risk of cache key dimension mismatch between the two read paths. Simplifies reasoning about when projection is stale. |
| **Risk** | Medium — must verify all cache key dimensions are the same for both paths. Requires careful spec coverage. |
| **How to verify** | Existing specs + new spec verifying that `getFilteredFlatList` and `getRowViewModelsById` return consistent results after any state mutation sequence. |
| **LOC impact** | ↓ ~40 LOC (remove duplicate cache logic) |

### Proposal 4: Signal-first DS layer to remove imperative sync boilerplate

| Aspect | Detail |
|--------|--------|
| **What to change** | Replace `effect()` + `set()` patterns in `TreeExplorerComponent` with computed signals and `linkedSignal` (Angular 19+). Remove manual `effectRef` tracking where possible. Move from imperative `stateVersion` counter to signal composition. |
| **Why** | Reduces ~100 LOC of sync boilerplate. Leverages Angular's built-in change propagation. Makes component code more declarative and easier to test. |
| **Risk** | Medium — `linkedSignal` is new in Angular 19; must verify all edge cases (timing of config vs data changes, filter debounce). |
| **How to verify** | All existing stories + specs must pass. Add timing-sensitive integration test for config → data → filter sequence. |
| **LOC impact** | ↓ ~100 LOC |

### Proposal 5: TS 5.6+ `satisfies` + discriminated unions for config/type glue

| Aspect | Detail |
|--------|--------|
| **What to change** | Use `satisfies` for `DEFAULT_TREE_CONFIG` and related config factories. Replace union types with discriminated unions where `mode` field exists (e.g., `TreeFilteringConfig` mode field as discriminant). |
| **Why** | Catches config typos at definition site. Enables narrowing in switch statements. Reduces runtime validation boilerplate. |
| **Risk** | Low — `satisfies` is TS 5.4+; workspace already uses TS 5.6+. No runtime change. |
| **How to verify** | Typecheck passes. Add intentional typo test cases to verify `satisfies` catches them. |
| **LOC impact** | Neutral to ↓ ~20 LOC |

### Proposal 6: CSS `:where()` / `:is()` selector deduplication in SCSS

| Aspect | Detail |
|--------|--------|
| **What to change** | Replace repeated state selectors (hover, focus, disabled, error) with `:where()` and `:is()` combinators. Deduplicate shared property blocks. |
| **Why** | tree-item.component.scss has 250+ LOC with significant duplication across state selectors. `:where()` has zero specificity, making overrides easier. |
| **Risk** | Low — `:where()` and `:is()` have excellent browser support. Must verify no specificity regressions in Storybook. |
| **How to verify** | Visual regression via Storybook screenshots. All theme tokens still work. |
| **LOC impact** | ↓ ~60 LOC |

### Proposal 7: Explicit exports map + internal module boundaries

| Aspect | Detail |
|--------|--------|
| **What to change** | Add `exports` field to tree-core and tree-explorer `package.json` to define public entry points. Mark engine internals as `@internal` in JSDoc. Add lint rule to prevent importing from `./lib/engine/` directly outside of tree-core. |
| **Why** | Prevents consumers from importing engine internals, which breaks upgrade safety. Makes the public API boundary machine-enforceable. |
| **Risk** | Low — only affects new integrations; existing code paths already use barrel exports. |
| **How to verify** | Build passes. Import lint rule flags direct engine imports from outside tree-core. |
| **LOC impact** | ↑ ~20 LOC (package.json + JSDoc annotations) |

### Proposal 8: ARIA tree role compliance

| Aspect | Detail |
|--------|--------|
| **What to change** | Add `role="tree"` to viewport container, `role="treeitem"` to each row, `role="group"` to child containers. Add `aria-expanded`, `aria-selected`, `aria-level`, `aria-setsize`, `aria-posinset` attributes. |
| **Why** | Screen readers cannot navigate the tree as a tree without proper ARIA roles. Current implementation has partial keyboard nav but incomplete semantic markup. |
| **Risk** | Low — additive attributes. Must verify with screen reader testing (NVDA/VoiceOver). |
| **How to verify** | Manual screen reader walkthrough. axe-core automated check in Storybook. |
| **LOC impact** | ↑ ~40 LOC |

### Proposal 9: Built-in performance instrumentation hooks

| Aspect | Detail |
|--------|--------|
| **What to change** | Add optional `TreePerfObserver` interface in tree-core. `TreeEngine` emits timing events for: projection cache hit/miss, filter recompute duration, page scheduling duration. Wrappers can subscribe to aggregate metrics. |
| **Why** | Currently perf is manual/external. Built-in hooks enable alerting on perf regressions and dashboard integration. |
| **Risk** | Low — opt-in observer pattern. No perf impact when no observer is registered. |
| **How to verify** | Unit test: observer receives expected events for known operations. |
| **LOC impact** | ↑ ~80 LOC |

### Proposal 10: Presets (FileExplorer, OrgChart, Permissions)

| Aspect | Detail |
|--------|--------|
| **What to change** | Implement the TODO stubs in `presets/index.ts`. Each preset is a factory that returns a `Partial<TreeConfig<T>>` with sensible defaults for common use cases. |
| **Why** | Reduces boilerplate for common patterns. Presets serve as documentation-by-example. |
| **Risk** | Low — additive. No changes to core. |
| **How to verify** | Story per preset showing working tree with minimal adapter. |
| **LOC impact** | ↑ ~100 LOC per preset |

---

## Refinement Priority Ordering

| Priority | Proposal | Rationale |
|----------|----------|-----------|
| 🔴 P1 | #8 ARIA tree role compliance | Accessibility is a non-negotiable requirement |
| 🔴 P1 | #7 Explicit exports map | API boundary enforcement prevents future breaking changes |
| 🟡 P2 | #1 AbortController cancellation | Correctness improvement for async operations |
| 🟡 P2 | #3 Unify projection computation | Reduces bug surface area in core hot path |
| 🟡 P2 | #4 Signal-first DS layer | Major LOC reduction in most complex file |
| 🟢 P3 | #5 TS satisfies + discriminated unions | Type safety improvement, low risk |
| 🟢 P3 | #6 CSS :where()/:is() dedup | Style maintainability, low risk |
| 🟢 P3 | #2 ResizeObserver viewport | UX improvement for dynamic layouts |
| 🔵 P4 | #9 Perf instrumentation | Observability improvement |
| 🔵 P4 | #10 Presets | DX improvement, documentation value |

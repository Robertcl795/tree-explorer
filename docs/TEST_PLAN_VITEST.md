# Vitest Test Plan (Outline)

Reference baseline: `docs/diagrams_angular.md`, `docs/ARCHITECTURE_OVERVIEW.md`.

## Test Architecture
- Runner: Vitest.
- Principle: pure engine tests first, host integration second, property/fuzz last.
- Required fixtures: deterministic synthetic adapter and deterministic scheduler helpers.

## Layer 1: Engine Unit Tests (Pure Reducer + Selectors)

### Scope
- No framework imports.
- No DOM.
- Assert deterministic state and command emissions.

### Suites
1. `engine.projection.spec.ts`
2. `engine.paging.spec.ts`
3. `engine.selection.spec.ts`
4. `engine.filtering.spec.ts`
5. `engine.navigation.spec.ts`
6. `engine.invariants.spec.ts`

## Layer 2: Adapter Contract Tests

### Scope
- Validate any adapter against required behavior contract.
- Use a shared harness package (`adapter-contract-harness`).

### Contract checks
- Stable and unique ID mapping.
- Label/icon mapping deterministic and synchronous.
- `getRoots`/`getChildren` resolve shapes and paging metadata.
- Filtering semantics remain adapter-owned.
- Optional `resolvePath` behavior when pinned navigation enabled.

## Layer 3: Angular Host Integration Tests

### Scope
- `TreeExplorerComponent` integration with engine and command runner.
- Verify DOM wiring, outputs, and virtualization behavior.

### Suites
1. `tree-explorer.component.int.spec.ts`
2. `tree-explorer.keyboard.int.spec.ts`
3. `tree-explorer.page-aware.int.spec.ts`

## Layer 4: Lit Host Integration Tests (Outline)

### Scope
- Equivalent integration behavior for Lit wrapper.
- Ensure parity with Angular behavior for command/event flow.

### Suites
1. `tree-explorer.element.int.spec.ts`
2. `tree-explorer.element.keyboard.int.spec.ts`
3. `tree-explorer.element.page-aware.int.spec.ts`

## Layer 5: Property and Fuzz Tests

### Scope
- Randomized intent streams and async completion orders.
- Assert invariants across long event sequences.

### Generators
- Random viewport jumps and scroll bursts.
- Random expand/collapse/filter/select/nav interleavings.
- Random completion order and artificial delays.

## Feature Coverage Matrix

### Virtualization window calculations
- What to test
- Window start/end math from `scrollTop`, `viewportHeight`, `rowHeight`, `overscan`.
- Example cases
- top of list, mid list, near end, tiny viewport, oversized overscan.
- Invariants asserted
- rendered row count <= window size + overscan budget.
- row keys are stable across adjacent scrolls.
- Stale/epoch cases
- scroll-induced page completions arriving after filter epoch bump are discarded.
- Race cases
- rapid wheel/trackpad burst with alternating small/large deltas.
- Error handling
- fallback row rendering when data row is temporarily unavailable.

### Page computation from viewport range
- What to test
- page key derivation and boundary inclusions.
- Example cases
- range exactly aligned, straddling 2 pages, spanning 3+ pages.
- Invariants asserted
- no missed pages for visible range.
- no unnecessary pages outside range + overscan.
- Stale/epoch cases
- old epoch page completions ignored.
- Race cases
- repeated `ViewportChanged` during pending requests.
- Error handling
- page failure marks correct error scope.

### Dedupe and inFlight registry
- What to test
- duplicate command suppression for same page and epoch.
- Example cases
- duplicate viewport events for same range.
- Invariants asserted
- `inFlight` and `loadedPages` remain disjoint and clean after completion.
- Stale/epoch cases
- invalidation clears effective in-flight ownership for prior epoch.
- Race cases
- completion order inversion for pages 3 and 4.
- Error handling
- failed requests removed from `inFlight` and retried per policy.

### Epoch bump invalidation
- What to test
- filter/structural changes increment epoch and invalidate pending work.
- Example cases
- filter change during page load.
- expand/collapse while children request pending.
- Invariants asserted
- stale completions produce no state mutation.
- current epoch results merge exactly once.
- Stale/epoch cases
- mixed old/new epoch completions.
- Race cases
- filter change followed by immediate scroll and expand.
- Error handling
- stale failures do not surface user-facing errors.

### Selection modes
- What to test
- `none`, `single`, `multi`, range-anchor behavior.
- Example cases
- ctrl/meta toggle, shift range, mode flip on init.
- Invariants asserted
- mode `none` never mutates `selectedIds`.
- selected IDs always exist or are pruned deterministically.
- Stale/epoch cases
- selection survives non-structural page completion.
- Race cases
- select while range loads and rows remap.
- Error handling
- invalid IDs ignored safely.

### Keyboard navigation across unloaded ranges
- What to test
- arrow/home/end/page keys with not-yet-loaded targets.
- Example cases
- End key to unloaded tail requiring `LoadPage` command.
- Invariants asserted
- active index and active ID remain coherent.
- `ScrollTo` command emitted only when required.
- Stale/epoch cases
- nav-triggered load result stale after filter update.
- Race cases
- rapid key repeats across multiple unloaded pages.
- Error handling
- load failures surface via host output and preserve focusable state.

### Filtering semantics (adapter-owned)
- What to test
- host/engine does not implement domain matcher semantics.
- Example cases
- adapter client matcher vs server filter API mode.
- Invariants asserted
- engine stores query intent only.
- matching logic source is adapter contract.
- Stale/epoch cases
- previous query results discarded.
- Race cases
- fast query churn with debounce boundaries.
- Error handling
- server filter failure path emits scoped error.

### Pinned items toggle and navigation
- What to test
- pinned enable/disable behavior and path resolution flows.
- Example cases
- navigate to pinned target not yet loaded.
- Invariants asserted
- no pinned navigation attempt without required adapter path support.
- Stale/epoch cases
- pinned navigation stale completions dropped.
- Race cases
- pinned navigation while user scrolls and filters.
- Error handling
- `navigation` scoped errors for unresolved paths.

### Context menu ownership in host
- What to test
- context menu state and actions handled only in host component.
- Example cases
- right-click row, keyboard context key.
- Invariants asserted
- engine tracks context target ID only.
- action execution emitted outward, not domain-executed inside host.
- Stale/epoch cases
- context target clears on invalidation.
- Race cases
- context menu open during row unload/reload.
- Error handling
- action errors emit host-level error outputs.

### No visibleRows cache regression
- What to test
- absence of persistent rendered-row caches.
- Example cases
- static analysis guard and runtime memory behavior checks.
- Invariants asserted
- selectors remain `rowAt(index)` + `totalCount` based.
- no second row materialization structure appears.
- Stale/epoch cases
- invalidations do not force full list materialization.
- Race cases
- scroll and filter storms do not allocate linear visible arrays.
- Error handling
- n/a.

## Cross-Cutting Error, Retry, and Abort Cases
- Retry once on transient adapter errors and then emit terminal `LoadFailed`.
- Abort or invalidate pending work on destroy and epoch transitions.
- Confirm partial failures do not corrupt unrelated loaded ranges.

## Required CI Gates
- [ ] Engine unit suites pass.
- [ ] Adapter contract suite passes for synthetic and real adapters.
- [ ] Angular integration suites pass.
- [ ] Lit integration outline suites are scaffolded and tracked.
- [ ] Property/fuzz suite passes deterministic seed set.

## Success Checkpoints
- 100% union-branch coverage for event and command discriminators in engine tests.
- 100% stale epoch completion rejection in race-focused suites.
- 0 regressions on no-visibleRows-cache static and runtime guard tests.

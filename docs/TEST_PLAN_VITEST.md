# Vitest Test Plan

## 1) Test Strategy

- Prioritize pure engine correctness before host integration.
- Add tests in every implementation phase.
- Treat determinism, stale-response safety, and projection correctness as non-negotiable.

## 2) Layered Coverage

### Layer A: Engine unit tests (pure)
Scope:
- No framework imports.
- No DOM.

Suites:
1. `engine.reducer.spec.ts`
2. `engine.projection.spec.ts`
3. `engine.paging.spec.ts`
4. `engine.selection.spec.ts`
5. `engine.filtering.spec.ts`
6. `engine.navigation.spec.ts`
7. `engine.invariants.spec.ts`

Key assertions:
- Deterministic replay for identical event streams.
- Parent-aware page derivation from viewport ranges.
- Dedupe correctness for in-flight/loaded page requests.
- Stale completion rejection using `epoch` + `requestId`.
- Selector correctness via `totalCount`, `rowAt(index)`, `rowKeyAt(index)`.

### Layer B: Adapter contract tests
Scope:
- Any adapter implementation must satisfy contract invariants.

Key assertions:
- ID mapping is stable and unique.
- Label/icon mapping is deterministic.
- Root/child retrieval contract shape is valid.
- Filtering semantics remain adapter-owned.
- Optional path resolution contract is valid when pinned navigation is enabled.

### Layer C: Angular host integration tests
Scope:
- `TreeExplorerComponent` intent/command/render pipeline.

Suites:
1. `tree-explorer.intents.int.spec.ts`
2. `tree-explorer.command-runner.int.spec.ts`
3. `tree-explorer.virtual-window.int.spec.ts`
4. `tree-explorer.keyboard-a11y.int.spec.ts`
5. `tree-explorer.context-menu.int.spec.ts`

Key assertions:
- UI intents map to expected engine events.
- Adapter calls are command-driven only.
- Virtual window row count stays bounded.
- Keyboard navigation remains deterministic with unloaded ranges.
- Context menu remains host-owned for mouse + keyboard invocation.

### Layer D: Race and error hardening tests
Scope:
- Concurrency and stale-response behavior.

Key assertions:
- Scroll burst + filter change race ignores stale page results.
- Expand/collapse invalidation during page load remains deterministic.
- Cancellation/stale paths do not mutate unrelated state.
- Error surfaces are scoped (root/page/children/navigation).

### Layer E: Performance regression tests
Scope:
- Large synthetic adapters and selector/runtime behavior.

Key assertions:
- `rowAt(index)` latency remains within gate.
- Dispatch latency and DOM row ceiling stay within threshold.
- No unbounded memory growth under sustained scrolling.

## 3) Critical Scenario Matrix

- Top/middle/end viewport range calculations.
- Root paging and child paging in same session.
- Range straddling multiple pages with overscan.
- Rapid query churn with debounced dispatch.
- Selection mode transitions: `none`, `single`, `multi`.
- Pinned navigation with optional path resolution and stale completions.
- Keyboard navigation when target rows are not yet loaded.

## 4) CI Gate Checklist

- [ ] Engine unit suites green.
- [ ] Adapter contract suites green.
- [ ] Angular integration suites green.
- [ ] Race/error suites green.
- [ ] Performance threshold suites green.
- [ ] No regression in architecture invariants.

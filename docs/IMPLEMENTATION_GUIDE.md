# Senior Developer Implementation Guide

## Mission
Build Tree Explorer from scratch with deterministic engine orchestration, adapter-only domain boundaries, page-aware virtual loading correctness, and npm-ready packaging.

## Architecture Invariants (Non-Negotiable)
- `@tree-core` owns state machine behavior: indexing, projection, expansion, selection, loading, filtering state, navigation, selectors.
- `TreeExplorerComponent` is the Angular host entry point and command executor.
- Flow is fixed: UI intents -> `TreeExplorerComponent` -> `TreeEngine` -> derived outputs -> rendering.
- `TreeAdapter` is the only domain boundary for IDs, labels/icons, roots/children, filtering semantics, optional path resolution.
- Async pipeline is command-based with `epoch` + `requestId` stale protection.
- Projection is selector-driven (`totalCount`, `rowAt(index)`) with no parallel row-cache arrays.
- Node state changes only through engine dispatch transitions.
- Context menu DOM ownership stays in `TreeExplorerComponent`.

## Hard Measurable Goals
- 500K gate: sustained virtual scrolling meets performance gate in synthetic harness.
- Range-loading correctness: 100% stale completion rejection in race tests.
- Dedup correctness: 0 duplicate page load commands for identical `(epoch, pageKey)`.
- DOM ceiling: rendered rows stay within `viewportRows + overscanRows + spacer elements`.
- Determinism: replaying the same event stream yields identical snapshots and commands.

## Phase A: Repo and Package Scaffolding
### Scope
- Establish package/workspace baseline for `@tree-core` and Angular wrapper.

### Steps
1. Create package roots and explicit public export entry points.
2. Wire build, test, typecheck scripts for both packages.
3. Set TS strict mode and project references.

### Measurable checkpoints
- `pnpm -r build` passes.
- `pnpm -r test` runs green for scaffold suites.
- Export maps expose only approved public APIs.

### Stop conditions
- Circular cross-package imports.
- Internal/deep-import-only API consumption.

### Required PR boundary
- PR includes workspace/package scaffolding only.

## Phase B: Core Types and Discriminated Unions
### Scope
- Define canonical contracts and event/command/result types.

### Steps
1. Define `TreeAdapter`, `TreeConfig`, `FilterQuery`, `TreeLoadError`.
2. Define discriminated unions for `EngineEvent`, `EngineCommand`, completion events.
3. Define normalized entity model (`id` + relation maps).
4. Add exhaustiveness checks for reducers and command handlers.

### Measurable checkpoints
- 100% exhaustiveness coverage for event/command switches.
- 0 duplicated contract definitions outside `@tree-core`.
- Type tests verify adapter contract invariants.

### Stop conditions
- Union branches handled via fallback `any`.
- Host concerns leaking into core contract types.

### Required PR boundary
- PR includes type system + type tests only.

## Phase C: Engine Skeleton (Reducer + Commands + Selectors)
### Scope
- Implement deterministic `TreeEngine` dispatch loop and read-only selectors.

### Steps
1. Build `dispatch(event) -> { snapshot, commands }`.
2. Implement immutable snapshot shape.
3. Implement selectors: `totalCount`, `rowAt`, `rowKeyAt`, `activeId`, `selectedIds`.
4. Add invariant assertions in dev/test mode.

### Measurable checkpoints
- Reducer purity tests pass.
- Replay tests show identical command/snapshot outputs.
- Selector read paths do not mutate state.

### Stop conditions
- Side effects inside reducer path.
- Mutable singleton state shared across component instances.

### Required PR boundary
- PR includes engine shell + determinism tests, no paging logic.

## Phase D: Projection Strategy (`rowAt`/`totalCount`)
### Scope
- Implement projection without materializing parallel render caches.

### Steps
1. Build index structures for depth, order, parent/child relations.
2. Implement index-addressable projection access via `rowAt(index)`.
3. Implement incremental recompute for expand/collapse/filter changes.
4. Expose stable row keys based on adapter IDs.

### Measurable checkpoints
- `rowAt(index)` latency meets micro-benchmark gate.
- Projection ordering/depth remain stable across repeated transitions.
- No row-cache arrays introduced.

### Stop conditions
- Projection path duplicates rendered-window data in persistent arrays.
- Rebuild cost scales linearly with total nodes for localized updates.

### Required PR boundary
- PR includes projection module + projection benchmark harness.

## Phase E: Paging and Range Loading (Page-Aware + Dedupe + Epoch)
### Scope
- Implement range-derived page requests with stale-safe merge behavior.

### Steps
1. Derive missing pages from viewport range + overscan.
2. Track `inFlight` and `loadedPages` registries.
3. Emit load commands with `(epoch, requestId, pageKey/nodeId)`.
4. Merge completions only when epoch/requestId is current.
5. Invalidate pending work on structural/filter epoch bumps.

### Measurable checkpoints
- Duplicate `(epoch,pageKey)` commands: 0.
- Stale completion merge rate: 0.
- Race suite (rapid scroll + invalidation) passes.

### Stop conditions
- Completion merge without epoch verification.
- Registry leaks after completion/failure.

### Required PR boundary
- PR includes paging/range modules and race-condition tests.

## Phase F: Angular Host Glue (Signals + Explicit RxJS Execution)
### Scope
- Bind host DOM intents to engine dispatch and command execution.

### Steps
1. Instantiate one engine per `TreeExplorerComponent` instance.
2. Map DOM handlers to explicit `dispatchIntent(...)` calls.
3. Queue commands and execute them in a bounded RxJS pipeline.
4. Dispatch completion events explicitly back into engine.
5. Update render snapshot via `signal` + `computed` reads only.

### Measurable checkpoints
- Adapter calls occur only in command execution path.
- Host renders only selector-derived snapshot data.
- Host teardown clears command subscriptions and observers.

### Stop conditions
- Implicit command execution outside handlers/pipeline.
- Domain branching in component/template.

### Required PR boundary
- PR includes host glue + integration tests only.

## Phase G: Virtual Window Rendering
### Scope
- Fixed-row virtualization with spacer-based layout and stable row identity.

### Steps
1. Track viewport metrics (`scrollTop`, `height`, rowHeight, overscan).
2. Compute `[startIndex,endIndex)` range.
3. Render only range rows via `rowAt(index)`.
4. Use top/bottom spacers from `totalCount * rowHeight`.
5. Keep row keying stable by adapter IDs.

### Measurable checkpoints
- DOM row count stays under gate ceiling.
- 500K smooth-scroll harness gate passes.
- Scroll position remains stable during async page merges.

### Stop conditions
- Rendering expands to full projected list.
- Key churn causes rerender storms.

### Required PR boundary
- PR includes virtualization rendering + perf assertions.

## Phase H: Interaction Features
### Scope
- Implement expand, selection, filtering, pinned behavior, and context menu.

### Steps
1. Wire expand/collapse intents to engine transitions.
2. Implement selection modes: `none`, `single`, `multi`.
3. Apply filter query as explicit intent; adapter controls matching semantics.
4. Implement pinned toggling and navigation path resolution behavior.
5. Handle context menu invocation (mouse + keyboard) in host component.

### Measurable checkpoints
- Selection mode matrix tests pass.
- Filter invalidation + reload behavior is deterministic.
- Pinned state persists for runtime session per component instance.

### Stop conditions
- Matching logic duplicated inside UI.
- Context menu ownership moved to row-level components.

### Required PR boundary
- PR includes interaction feature behavior + tests/stories.

## Phase I: Accessibility and Keyboard Navigation
### Scope
- Implement semantic tree pattern and deterministic keyboard traversal.

### Steps
1. Add tree/container ARIA attributes and row-level semantics.
2. Route keyboard events through `dispatchIntent` handlers.
3. Support Arrow keys, Home/End, PageUp/PageDown, Enter, Space.
4. Ensure navigation remains correct when target ranges are unloaded.

### Measurable checkpoints
- Keyboard traversal integration suite passes.
- `aria-activedescendant` and active row state remain synchronized.
- Accessibility checks pass for required stories.

### Stop conditions
- Keyboard handling mutates UI state outside engine transitions.
- Focus/active state desynchronization under loading churn.

### Required PR boundary
- PR includes a11y/keyboard behavior and related tests.

## Phase J: Hardening (Retry, Cancel, Stale, Errors)
### Scope
- Enforce resilient async behavior under failure and concurrency pressure.

### Steps
1. Standardize error envelopes and emission paths.
2. Implement bounded retry policy with terminal failure event.
3. Handle cancellation/teardown using abort + subscription cleanup.
4. Validate stale-drop behavior across mixed completion orders.

### Measurable checkpoints
- Retry policy tests pass (single retry then terminal fail).
- No post-destroy completion mutates snapshot.
- Partial load failures preserve tree usability.

### Stop conditions
- In-flight work survives component destroy.
- Error handling diverges by load type.

### Required PR boundary
- PR includes reliability hardening and race/failure tests.

## Phase K: Storybook Readiness
### Scope
- Provide deterministic stories for behavior and scale validation.

### Steps
1. Add synthetic adapters for 10K/100K/500K scenarios.
2. Add controls for config toggles (virtual, page-aware, selection, context menu, pinned).
3. Add interaction stories for keyboard/filter/expand/selection/context menu.
4. Add invalidation race story for range-loading correctness.

### Measurable checkpoints
- Required stories build and run in CI.
- Story interactions demonstrate architecture boundaries.
- 500K story passes DOM and scroll gates.

### Stop conditions
- Stories bypass public component API.
- Story setup embeds domain logic in component internals.

### Required PR boundary
- PR includes stories/mocks only.

## Phase L: npm Packaging Readiness
### Scope
- Finalize publishable package surfaces and release gates.

### Steps
1. Validate `@tree-core` framework-agnostic exports.
2. Validate Angular wrapper exports, typings, peer dependencies.
3. Validate package artifacts with `npm pack --dry-run`.
4. Complete changelog, semver, API stability checks.

### Measurable checkpoints
- Dry-run package checks pass for release artifacts.
- Public API diff contains no undocumented breaking changes.
- Performance and correctness gates are green before tag.

### Stop conditions
- Internal modules leaked via export map.
- Missing release notes or migration notes for API changes.

### Required PR boundary
- PR includes packaging/release mechanics only.

## Cross-Phase Gates
- Gate 1: Deterministic replay and union exhaustiveness pass before host integration.
- Gate 2: Race suite (rapid scroll + filter/expand invalidation) pass before interaction rollout.
- Gate 3: 500K synthetic scroll and DOM ceiling gates pass before packaging.
- Gate 4: Storybook interaction matrix and accessibility checks pass before release.

## Final Validation Checklist
- [ ] Legacy entrypoint references are absent across both guides.
- [ ] Angular implicit side-effect APIs are not used in guidance or snippets.
- [ ] Parallel rendered-row cache patterns are not described or introduced.
- [ ] Naming is consistent: `TreeExplorerComponent`, `TreeItemComponent`, `TreeEngine`, `TreeAdapter`.
- [ ] Manual check confirms each phase A-L includes scope, steps, measurable checkpoints, stop conditions, and PR boundary.

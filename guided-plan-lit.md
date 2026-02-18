# Guided Plan (Lit): Framework-Agnostic Tree Wrapper on `@tree-core`

## Discovery Snapshot
- Canonical source: `guided-plan.md` includes async-tree removal (`Phase 6`) and final acceptance gates.
- Angular wrapper exists at `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`.
- Core contracts/engine exist at `packages/tree-core/src/lib/types` and `packages/tree-core/src/lib/engine/tree-engine.ts`.
- Lit wrapper POC exists at `packages/lit-tree-explorer/src/tree-lit.ts` and already uses `@lit-labs/virtualizer`.
- Stories are package-local today, not under `/testing`:
  - `packages/tree-explorer/src/stories/*`
  - `packages/lit-tree-explorer/src/stories/lit-tree.stories.ts`
- `/testing` does not exist yet in this repo.
- No current app consumers were found under `/home/rocker/LABS/*/apps`; consumer hits were found in sibling library workspaces:
  - `/home/rocker/LABS/covalent-async-tree`
  - `/home/rocker/LABS/covalent/libs/angular-tree-explorer`

## 1. Goal and Boundaries
- Goal: deliver a framework-agnostic `lit-tree-explorer` wrapper package that reuses `TreeEngine` and canonical contracts from `@tree-core`.
- DS-thin constraint is mandatory:
  - no domain/API logic in Lit element
  - adapter calls only through orchestration/controller layer
- Required architecture flow:
  - UI intents -> Lit element -> `TreeController` -> `TreeEngine` + adapter boundary -> derived rows/state -> rendering

## 2. Proposed Public API (Lit Element)
- Custom element target: `lit-tree-explorer`.
- Temporary compatibility alias retained during migration: `td-tree-lit`.

### Properties
- `data: TreeChildrenResult<TSource> | TSource[]`
- `adapter: TreeAdapter<TSource, T>`
- `config: Partial<TreeConfig<T>>`
- `filterQuery: TreeFilterInput`

### Normalized events
- `selection-change`
- `action`
- `load-error`
- `navigation-result`

### Optional parity events (compatibility)
- `item-click`
- `item-toggle-expand`
- `item-toggle-select`

## 3. Controller Design
- New controller file:
  - `packages/lit-tree-explorer/src/lib/tree-controller.ts`
- Controller responsibilities:
  - own `TreeEngine` instance
  - own async cancellation and stale-result guards
  - perform adapter root/children/paged loading
  - manage range-loading orchestration for virtualization/page-aware behavior
  - apply config/filter updates
  - perform navigation (including `resolvePathToNode` path resolution)
- Lit element responsibilities:
  - render controller-provided projection
  - manage focus/keyboard delegation
  - forward user intents to controller
  - dispatch public events only

## 4. Virtualization and Page-Aware Plan
- Primary virtualization path: keep `@lit-labs/virtualizer`.
- Deterministic page-aware algorithm (controller-owned):
  1. receive rendered range
  2. inspect placeholders in range
  3. compute missing pages deterministically
  4. dedupe in-flight requests
  5. apply results in place via engine transitions
- Fallback path (if virtualizer range signal is missing):
  - derive `[start, end]` from scroll offset + fixed `itemSize`
  - call same `ensureRangeLoaded(start, end)` controller path
- Testability requirement:
  - isolate range/page math in pure helper with unit tests

## 5. Keyboard Navigation and Focus Strategy
- Use container focus + `aria-activedescendant` to avoid focus instability on recycled virtual rows.
- Handle keys:
  - `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `Enter`, `Space`
- Responsibility split:
  - controller decides navigation/expand/selection transitions
  - element updates active-descendant, emits events, and performs scroll-to-index

## 6. Testing and Demo Plan
- Move Lit stories under:
  - `testing/stories/lit-tree-explorer/*`
- Reuse shared fixtures from:
  - `testing/mocks/*`
- Add Lit-focused tests:
  - controller unit tests for paging/range-loading/filter/navigation
  - element event-contract tests for normalized events
- Demo harness:
  - Storybook web-components build remains primary demo validation path

## 7. Lit Phase Roadmap

### Phase 0: Surface lock and alias compatibility
- Scope:
  - lock public API and map `td-tree-lit` -> `lit-tree-explorer` compatibility strategy
  - document current gaps (`build:lit`/tests not fully wired)
- Acceptance criteria:
  - public surface is frozen and migration-safe
  - alias strategy documented and testable
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

### Phase 1: Introduce `TreeController` and migrate adapter IO
- Scope:
  - add `packages/lit-tree-explorer/src/lib/tree-controller.ts`
  - move root/children loading, filtering, and engine wiring out of element
- Acceptance criteria:
  - element no longer contains domain/data loading decisions
  - controller owns all adapter interactions
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

### Phase 2: Deterministic page-aware virtualization wiring
- Scope:
  - route virtualizer rendered range through controller
  - implement deterministic missing-page computation + dedupe
- Acceptance criteria:
  - range-loading correctness under rapid scrolling
  - no duplicate or stale commits
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

### Phase 3: Keyboard and focus accessibility completion
- Scope:
  - active-descendant model
  - deterministic key handling and scroll targeting
- Acceptance criteria:
  - keyboard behavior matches Angular semantics for key transitions
  - focus remains stable in virtualized and non-virtualized states
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

### Phase 4: `/testing` stories and mocks migration
- Scope:
  - move lit stories to `testing/stories/lit-tree-explorer`
  - share deterministic mocks from `testing/mocks`
- Acceptance criteria:
  - lit stories run against shared fixtures
  - storybook remains deterministic and compact
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

### Phase 5: Interop proof (Angular and Lit share engine/contracts)
- Scope:
  - prove Angular and Lit wrappers run on identical `@tree-core` contracts and shared adapter fixtures
  - demonstrate parity for filtering, paging, errors, and navigation semantics
- Acceptance criteria:
  - same adapter fixtures produce equivalent behavior in both wrappers
  - contract drift is blocked by shared test coverage
- Verification:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer build:lit
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build:lit
  ```

## 8. Important Public API / Type Changes (Additive)
- Additive defaults proposed in `TreeConfig`:
  - `virtualization.enabled?: boolean` (default `true` when virtualization mode is active)
  - `virtualization.pageAware?: boolean` (default `true` for paged adapters)
  - `keyboardNavigation?: boolean` (default `true`)
- Angular selector/inputs/outputs stay unchanged.
- Lit introduces normalized events and may keep compatibility aliases during migration.

## 9. Required Test Cases and Scenarios
1. Range-loading correctness with rapid scroll across unloaded pages.
2. No stale load commits after filter/config changes.
3. Pinned navigation success path with `resolvePathToNode`.
4. Pinned navigation failures emit `TreeLoadError`/`navigation-result`.
5. Filtering behavior across client/hybrid/server modes.
6. Keyboard traversal and activation in virtualized and non-virtualized views.
7. Context menu ownership remains wrapper-level with zero domain branching.

## 10. Assumptions and Defaults
- App #1 and App #2 are external consumers; no in-repo app consumers were found.
- Existing Angular public component usage remains stable.
- Story/mocks consolidation target is `/testing/stories` and `/testing/mocks`.
- Lit currently has POC scaffolding and no wired test/build pipeline; wiring is part of this roadmap.
- All phases keep repo green with incremental checkpoints and no feature cuts.

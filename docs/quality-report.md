# Quality & Shortcomings Report

Date: 2026-02-09
Scope: `@tree-core`, `@tree-explorer`, `@lit-tree-explorer` in `/home/rocker/LABS/tree-explorer`

## 1) Current Architecture and Data Flow

### Package map

- `packages/tree-core`
  - Contracts: `src/lib/types/*`
  - Engine: `src/lib/engine/tree-engine.ts`
  - Utilities: `src/lib/utils/*`
- `packages/tree-explorer`
  - Angular container: `src/lib/components/tree-explorer/tree-explorer.component.ts`
  - Angular row component: `src/lib/components/tree-item/tree-item.component.ts`
  - State/orchestration service: `src/lib/services/tree.service.ts`
  - Adapter helper: `src/lib/adapters/index.ts`
- `packages/lit-tree-explorer`
  - Lit wrapper POC: `src/tree-lit.ts`

### Runtime flow today (Angular)

1. `TreeExplorerComponent` receives `data`, `adapter`, `config`.
2. `TreeStateService` maps sources to `TreeNode[]` with `mapSourcesToNodes`.
3. `TreeEngine` stores nodes and computes flattened rows (`getVisibleRows`).
4. Component renders rows and forwards row events back to `TreeStateService`.

### Runtime flow today (Lit POC)

1. `TreeLit` resolves root sources.
2. Creates root nodes inline (not via shared mapping util).
3. Uses `TreeEngine` for visible rows.
4. Renders with `lit-virtualizer`.

## 2) Public API vs Actual Consumer Usage

### `@tree-core` public API

- Exports all types, engine, and utils (`src/public-api.ts` -> `src/lib/index.ts`)
- Core public contracts used by wrappers:
  - `TreeAdapter`
  - `TreeConfig`/enums
  - `TreeNode`, `TreeRowViewModel`
  - `TreeEngine`
  - `mapSourcesToNodes`

### `@tree-explorer` public API

- Exports components, services, adapters, types, tokens, module, utils (`src/public-api.ts`)
- Consumers in repo currently use:
  - `TreeExplorerComponent`
  - `ObjectTreeAdapter`
  - Core types through re-exported `tree.types`

### `@lit-tree-explorer`

- POC web component with package metadata, but no proper workspace build integration.
- Uses `@tree-core` directly.

### Observed mismatch

- API/docs imply nested eager trees are supported (`getChildren`), but initial mapping is shallow only; descendants are not inserted into engine state.

## 3) Quality Findings

## API design issues

1. **Adapter contract not pagination-ready**
   - `loadChildren` only returns plain child arrays (`TreeChildrenResult<TSource>`), no `totalCount`/page request type.
   - Impact: cannot support fixed-height placeholder strategy for paged backends.
   - Fix: introduce `PageRequest` + `PageResult<TSource>` and paged load contract.

2. **Leaky/inconsistent mapping paths**
   - Angular uses `mapSourcesToNodes`; Lit POC re-implements mapping inline.
   - Impact: divergent behavior and bugs between wrappers.
   - Fix: centralize node creation/mapping flow in core utilities.

3. **Over-exported `@tree-explorer` API surface**
   - Exports internals (service/module/utils) not necessarily library-grade stable API.
   - Impact: future refactors become breaking.
   - Fix: narrow exports or mark advanced exports as internal/unstable and document migration policy.

4. **`TreeExplorerModule.forRoot/forFeature` uses `any`**
   - No typed config contract in module helpers.
   - Fix: type with `Partial<TreeConfig<unknown>>` (or generic provider helpers).

## Coupling and responsibility issues

1. **Angular wrapper contains orchestration logic that should be engine-level**
   - Child loading orchestration currently in `TreeStateService` only.
   - Impact: no shared paging/placeholder orchestration for Lit and other wrappers.
   - Fix: move pagination orchestration primitives into `TreeEngine`.

2. **Lit wrapper duplicates logic and bypasses service patterns**
   - POC diverges from Angular orchestration and error handling semantics.
   - Fix: align wrappers on common engine contracts.

3. **Docs and comments claim Angular 20, but manifests use Angular 19**
   - Version inconsistency introduces onboarding confusion.
   - Fix: either upgrade or document exact supported version in root docs and scripts.

## Performance risks

1. **Critical: virtual scroll is not actually used in Angular template**
   - `cdk-virtual-scroll-viewport` contains `@for` loop, not `*cdkVirtualFor`.
   - Impact: full DOM render for all rows; severe regressions for large trees.
   - Fix: switch to `*cdkVirtualFor` and proper `trackBy` function.

2. **Potential row height mismatch**
   - Row host style defaults to fixed 32px while config `itemSize` defaults 48.
   - Impact: scroll math drift, jitter, blanking.
   - Fix: tie row height CSS variable to `itemSize`.

3. **Repeated expensive computations per refresh**
   - `getVisibleRows` recomputes flattening + hierarchical selection each call.
   - `calculateHierarchicalSelection` repeatedly traverses descendants.
   - Impact: high CPU for large trees and frequent state updates.
   - Fix: cache flatten + selection derivation by version, optimize selection traversal.

4. **Queue/array operations with avoidable overhead**
   - `getDescendantIds` uses `shift()` in loop.
   - Impact: extra allocations and O(n^2)-like behavior on big graphs.
   - Fix: index-based queue traversal.

5. **No range-driven lazy loading**
   - Child loading only on expand; quick scrolling cannot request missing pages.
   - Fix: add `ensureRangeLoaded` with in-flight dedupe by `(parentId,pageIndex)`.

## Functional correctness bugs

1. **Nested eager children are effectively broken**
   - `mapSourcesToNodes` is shallow; children IDs are set but child nodes are not inserted.
   - Expanding a node with `getChildren` data won’t render descendants unless `loadChildren` path is used.
   - Fix: recursive mapping utility for eager trees.

2. **Placeholder concept absent**
   - No non-interactive placeholder nodes to preserve total scroll height.
   - Fix: add placeholder node metadata and UI handling.

## Test gaps

1. No tests for true virtual scrolling behavior in Angular template.
2. No tests for eager nested-source correctness (`getChildren` recursion).
3. No tests for paged loading orchestration, placeholder replacement, range-driven fetch, in-flight dedupe.
4. No Storybook interaction assertions for quick-scroll page loading.

## Documentation gaps

1. No formal architecture docs folder currently present.
2. No page-aware virtualization design/guarantee document.
3. No monorepo root-operability docs (`pnpm build/test/storybook` orchestration).
4. Existing docs overstate support without clarifying constraints.

## 4) Prioritized Fix List

### P0 (must address first)

1. Fix Angular virtualization rendering (`*cdkVirtualFor` + stable `trackBy`).
2. Add pagination contracts (`PageRequest`, `PageResult`) and page-aware engine orchestration.
3. Implement placeholder nodes and range-driven page loading with in-flight dedupe.
4. Repair eager nested-data mapping recursion.
5. Establish root-first workspace scripts and install behavior.
6. Fix Storybook runtime/build failures at root command level.

### P1 (next)

1. Add core tests for placeholders/page loading/range fetch/error + retry.
2. Add dedicated Storybook page-aware validation story with request telemetry.
3. Align package exports/scripts and document monorepo workflows.
4. Tie rendered row height to configured virtualization item size.

### P2 (hardening)

1. Optimize selection and flattening computations with memoization/versioned caches.
2. Reduce API overexposure in `@tree-explorer` and formalize stable public surface.
3. Bring Lit wrapper closer to shared orchestration contracts or document as limited POC.
4. Consider build/task cache tooling only after root scripts are stable.

## 5) Assumptions for Implementation

- No breaking changes to existing high-level component inputs/outputs unless migration notes are provided.
- Context menu stays centralized at container level.
- Adapter remains the sole place for domain-specific logic.
- Pagination support is additive and opt-in per adapter/node.

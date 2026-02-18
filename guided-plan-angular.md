# Guided Plan (Angular): TreeExplorer Immediate Delivery for Two Consumer Apps

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

## 1. Scope and Non-Negotiables
- Target consumers: Angular 20+ applications this week.
- Current workspace baseline: Angular 19.2.x. Migration plan keeps public `tree-explorer` usage backward-safe while preparing Angular 20+ consumer rollout.
- Required flow: UI intents -> `TreeExplorerComponent` -> `TreeStateService` -> `TreeEngine` -> derived rows/state -> rendering.
- Invariants:
  - Adapter is the only domain boundary.
  - No parallel visible-row caches.
  - No direct node mutation outside `TreeEngine` transitions.
  - Context menu ownership stays in `TreeExplorerComponent`.
  - `async-tree` compatibility wrapper is removed and unsupported.
- Must preserve feature set: page-aware virtual scrolling, range-loading correctness, keyboard navigation, config-driven toggles, DS-thin rendering.

## 2. Integration Playbook for App #1 and App #2 (External Consumer Checklist)
Because no in-repo app consumers were found, App #1 and App #2 are external consumers.

### Consumer discovery checklist (run in each app)
1. Run:
   ```bash
   rg -n "from '@tree-explorer'|<tree-explorer|async-tree|AsyncTree|td-tree" <APP_PATH>
   ```
2. Replace legacy selectors/usages with `<tree-explorer>`.
3. Ensure imports use `@tree-explorer` for wrapper symbols and `@tree-core` for contracts/types.
4. Confirm adapter ownership of IDs, labels, icons, filtering semantics, pagination semantics, and optional path resolution.
5. Map toggles via `config` (`virtualization`, `pageAware`, `selection`, `actions/contextMenu`, `pinned`).
6. Validate app-level smoke flows:
   - initial load
   - virtual scroll paging
   - filtering
   - selection
   - context actions
   - pinned navigation
   - keyboard traversal

### Two-app rollout sequence
1. App #1 pilot: integrate and lock acceptance criteria first.
2. App #2 rollout: reuse same adapter checklist and acceptance matrix.
3. Merge gate: both apps pass smoke flows plus published package verification gates.

## 3. Phased Implementation Plan (Repo Work)

### Phase 0: Baseline lock and rollout inventory
- Goal: freeze migration baseline and required feature checklist.
- File touch list:
  - `guided-plan-angular.md`
  - `docs/architecture.md`
  - `packages/tree-explorer/src/public-api.ts`
  - `packages/tree-core/src/public-api.ts`
- Acceptance criteria:
  - Public wrapper surface (selector/inputs/outputs) is documented and locked.
  - Feature checklist is explicit and tied to stories/tests.
- Done when:
  - [ ] Baseline API snapshot is documented.
  - [ ] Required feature matrix is documented.
  - [ ] Rollout assumptions for two external apps are documented.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 1: Contract alignment in `@tree-core`
- Goal: make adapter/config/filter/error contracts canonical and singular.
- File touch list:
  - `packages/tree-core/src/lib/types/tree-adapter.ts`
  - `packages/tree-core/src/lib/types/tree-config.ts`
  - `packages/tree-core/src/lib/types/tree-filter.ts`
  - `packages/tree-core/src/lib/types/tree-errors.ts`
- Acceptance criteria:
  - `@tree-explorer` consumes contracts only from `@tree-core`.
  - No duplicated local contract types in wrapper package.
- Done when:
  - [ ] Contract changes are additive and backward-safe.
  - [ ] Wrapper imports are canonicalized to `@tree-core`.
  - [ ] Contract docs/examples compile against canonical types.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 2: Engine hardening (virtualization/page-aware/range-loading correctness)
- Goal: deterministic missing-page detection and placeholder replacement in `TreeEngine`.
- File touch list:
  - `packages/tree-core/src/lib/engine/tree-engine.ts`
  - `packages/tree-core/src/lib/engine/paging.ts`
  - `packages/tree-core/src/lib/engine/types.ts`
  - `packages/tree-core/src/lib/engine/*.spec.ts`
- Acceptance criteria:
  - Range requests derive repeatably from viewport range + placeholder state.
  - Duplicate page loads are deduplicated.
  - Loaded pages replace placeholders in-place with stable IDs.
- Done when:
  - [ ] Page-aware range logic is deterministic under rapid scrolling.
  - [ ] Paging specs cover overfetch/underfetch boundaries.
  - [ ] Engine state transitions remain deterministic and test-backed.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 3: Wrapper-owned orchestration service
- Goal: move orchestration IO out of component and keep wrapper DS-thin.
- File touch list:
  - `packages/tree-explorer/src/lib/services/tree-state.service.ts` (new)
  - `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`
  - `packages/tree-explorer/src/lib/index.ts`
- Acceptance criteria:
  - Component does not perform adapter loading logic directly.
  - Service owns cancellation, page-aware range loading calls, and engine command wiring.
- Done when:
  - [ ] Adapter calls are centralized in wrapper service.
  - [ ] Stale async commits are blocked.
  - [ ] Component only forwards intents and renders derived state.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 4: Component strictness + keyboard accessibility
- Goal: enforce DS-thin component responsibilities and keyboard/a11y correctness.
- File touch list:
  - `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`
  - `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.html`
  - `packages/tree-explorer/src/lib/components/tree-item/tree-item.component.ts`
  - wrapper specs under `packages/tree-explorer/src/lib/**/*.spec.ts`
- Acceptance criteria:
  - Context menu remains container-owned in `TreeExplorerComponent`.
  - Keyboard navigation is end-to-end reliable.
  - No domain/API branching in rendering components.
- Done when:
  - [ ] Arrow/Home/End/Enter/Space are validated.
  - [ ] Focus behavior works in virtualized and non-virtualized modes.
  - [ ] Context action routing remains wrapper-level only.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 5: Storybook and mocks relocation to `/testing`
- Goal: consolidate stories and mocks into shared deterministic harnesses.
- File touch list:
  - `testing/stories/tree-explorer/*` (new)
  - `testing/mocks/*` (new)
  - `packages/tree-explorer/.storybook/*`
  - story import paths from `packages/tree-explorer/src/stories/*`
- Acceptance criteria:
  - Critical stories run from `/testing/stories`.
  - Reusable deterministic fixtures live in `/testing/mocks`.
  - Story coverage remains compact and complete.
- Done when:
  - [ ] Shared pagination/filter/pinned mocks are deduplicated.
  - [ ] Story categories remain green after relocation.
  - [ ] Angular and Lit can share fixture contracts where appropriate.
- Verification commands:
  ```bash
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

### Phase 6: Async-tree removal closure and migration notes
- Goal: close migration and remove async-tree references from active docs/runtime usage.
- File touch list:
  - `docs/port-report.md`
  - `docs/docs-layout-proposal.md`
  - package READMEs that still reference async-tree compatibility
- Acceptance criteria:
  - Runtime exports/usages of async-tree are absent.
  - Migration note is explicit and discoverable.
- Done when:
  - [ ] `async-tree` guidance is replaced with `tree-explorer` guidance.
  - [ ] Migration notes call out unsupported async-tree wrapper.
  - [ ] Commands below pass.
- Verification commands:
  ```bash
  rg -n "async-tree|AsyncTree|asyncTree" /home/rocker/LABS/tree-explorer && exit 1 || true
  pnpm -C /home/rocker/LABS/tree-explorer build
  pnpm -C /home/rocker/LABS/tree-explorer test
  pnpm -C /home/rocker/LABS/tree-explorer storybook:build
  ```

## 4. Drop-In Usage Examples To Embed

### Minimal adapter
```ts
import type { TreeAdapter } from '@tree-core';

type Node = { id: string; name: string; hasChildren?: boolean };

export const adapter: TreeAdapter<Node, Node> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: (node) => fetch(`/api/tree/${node.id}/children`).then((r) => r.json()),
};
```

### Minimal config with toggles
```ts
import {
  SELECTION_MODES,
  VIRTUALIZATION_MODES,
  type TreeConfig,
} from '@tree-core';

type Node = { id: string; name: string };

export const config: Partial<TreeConfig<Node>> = {
  virtualization: {
    enabled: true,
    mode: VIRTUALIZATION_MODES.AUTO,
    itemSize: 40,
    pageAware: true,
  },
  keyboardNavigation: true,
  selection: { mode: SELECTION_MODES.MULTI },
  actions: [],
  pinned: { enabled: true, label: 'Pinned' },
};
```

### FilterQuery wiring
```ts
import { signal } from '@angular/core';
import type { TreeFilterInput, TreeFilterQuery } from '@tree-core';

const query = signal<TreeFilterInput>(null);

function setFilter(text: string) {
  const next: TreeFilterQuery = { text, mode: 'contains' };
  query.set(text.trim() ? next : null);
}
```

```html
<tree-explorer
  [data]="data"
  [adapter]="adapter"
  [config]="config"
  [filterQuery]="query()">
</tree-explorer>
```

## 5. Verification Matrix (Story -> Feature -> Tests)
| Story category | Primary feature validated | Core tests | Wrapper tests |
|---|---|---|---|
| `Tree/Virtual scroll` | virtualization performance and projection stability | `packages/tree-core/src/lib/engine/paging.spec.ts`, `packages/tree-core/src/lib/engine/tree-engine.spec.ts` | `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts` |
| `Tree/Virtual scroll/Page aware` | deterministic range loading correctness | `packages/tree-core/src/lib/engine/paging.spec.ts`, page-aware assertions in `tree-engine.spec.ts` | wrapper service specs + `tree-explorer.component.spec.ts` |
| `Tree/Filtering (100+ elements)` | client/hybrid/server filtering behavior | `packages/tree-core/src/lib/engine/visibility.spec.ts`, `packages/tree-core/src/lib/engine/tree-engine.spec.ts` | `packages/tree-explorer/src/lib/pipes/highlight-filter.pipe.spec.ts` |
| `Tree/Pinned items` + pinned error scenarios | pinned navigation success/failure handling | navigation/paging coverage in `tree-engine.spec.ts` | wrapper service navigation specs + component event specs |
| `Tree/Errors & edge cases` | load error propagation and rendering | error-path checks in engine/service specs | `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts` |

## 6. Migration Notes
- `async-tree` wrapper is removed and unsupported.
- Angular selector remains `tree-explorer`.
- Public usage remains inputs/outputs-compatible.
- Import paths remain `@tree-explorer` and `@tree-core` unless additive optional config fields are adopted.

## 7. Two-App Rollout Risks and Mitigations
- Risk: unstable IDs break selection and virtualization.
  - Mitigation: add adapter ID contract tests in each app.
- Risk: page-aware overfetch/underfetch during fast scrolling.
  - Mitigation: deterministic range tests + story validation in both apps.
- Risk: stale async responses after filter/config changes.
  - Mitigation: cancellation tokens/`AbortController` and stale-result guards before engine commit.
- Risk: keyboard regressions with virtualized rows.
  - Mitigation: active-descendant/roving focus tests and Storybook interaction checks.
- Risk: domain logic leakage into wrapper.
  - Mitigation: adapter boundary checklist in PR template + boundary-focused code review gate.

## 8. Important Public API / Type Changes (Additive)
- Additive defaults proposed in `TreeConfig`:
  - `virtualization.enabled?: boolean` (default `true` when virtualization mode is active)
  - `virtualization.pageAware?: boolean` (default `true` for paged adapters)
  - `keyboardNavigation?: boolean` (default `true`)
- Existing Angular selector/inputs/outputs remain unchanged.
- Lit introduces normalized events with temporary compatibility aliases during migration.

## 9. Required Test Cases and Scenarios
1. Range-loading correctness with rapid scroll across unloaded pages.
2. No stale load commits after filter/config changes.
3. Pinned navigation success path with `resolvePathToNode`.
4. Pinned navigation failures emit `TreeLoadError`/navigation result payload.
5. Filtering behavior across client/hybrid/server modes.
6. Keyboard traversal and activation in virtualized and non-virtualized modes.
7. Context menu ownership remains wrapper-level with zero domain branching.

## 10. Assumptions and Defaults
- App #1 and App #2 are external consumers; no in-repo app consumers were found.
- Existing Angular public component usage remains stable.
- Story/mocks consolidation target is `/testing/stories` and `/testing/mocks`.
- Lit currently has POC scaffolding and non-wired build/test pipeline; wiring is included in the Lit roadmap.
- All phases are incremental and keep repository quality gates green.

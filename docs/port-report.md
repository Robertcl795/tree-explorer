# Port Report: Canonical Tree Implementation (async-tree → tree-core + tree-explorer)

**Date:** 2026-02-16
**Branch:** `port/canonical-tree`
**Author:** Automated port agent

---

## PHASE 0 — Inventory, Baselines & Docs Drift

### 0.1 Working Branch

- **Project B (td-tree):** `port/canonical-tree` created from `main`
- **Project A (async-tree):** No changes needed to canonical source

### 0.2 Baselines

#### Package LOC + File Counts

| Package             | Files | LOC   |
| ------------------- | ----- | ----- |
| `async-tree`        | 50    | 7,306 |
| `tree-core`         | 39    | 4,025 |
| `tree-explorer`     | 55    | 7,375 |
| `lit-tree-explorer`  | 8     | 734   |
| **Total**           | **152** | **19,440** |

#### Top 16 Largest Files

| LOC  | File                                                |
| ---- | --------------------------------------------------- |
| 1158 | async-tree/core/services/tree.service.ts            |
| 1138 | tree-explorer/src/lib/services/tree.service.ts      |
| 763  | async-tree/explorer/components/tree-explorer/tree-explorer.component.ts |
| 699  | tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts |
| 612  | async-tree/core/engine/tree-engine.ts               |
| 611  | tree-core/src/lib/engine/tree-engine.ts             |
| 526  | tree-explorer/src/stories/tree-explorer.advanced.stories.ts |
| 524  | tree-explorer/src/stories/tree-explorer.page-aware.stories.ts |
| 501  | async-tree/core/engine/visibility.ts                |
| 500  | tree-core/src/lib/engine/visibility.ts              |
| 485  | lit-tree-explorer/src/tree-explorer.element.ts      |
| 466  | tree-explorer/documentation.json                    |
| 424  | tree-core/src/lib/engine/paging.ts                  |
| 424  | async-tree/core/engine/paging.ts                    |
| 388  | tree-core/src/lib/engine/tree-engine.spec.ts        |
| 388  | async-tree/core/engine/tree-engine.spec.ts          |

#### Export Surfaces

**async-tree (flat barrel)**
```
export * from './types'
export * from './engine/tree-engine'
export * from './services/tree.service'
export * from './utils'
export * from './tree.configs'
export { TreeExplorerComponent }
export { TreeItemComponent }
export { TreeHighlightMatchPipe }
```

**tree-core (framework-agnostic)**
```
export * from './types'
export * from './engine/tree-engine'
export * from './utils'
```

**tree-explorer (Angular wrapper)**
```
export * from './lib/components/index'
export * from './lib/services/index'
export * from './lib/adapters/index'
export * from './lib/types/index'
export * from './lib/tokens/index'
export * from './lib/utils/index'
export * from './lib/pipes/index'
export * from './lib/tree-explorer.module'
```

---

### 0.3 Structured Diff: async-tree (A) vs tree-core + tree-explorer (B)

#### Engine Files (async-tree/core/engine → tree-core/src/lib/engine)

| File              | Status              | Notes                                      |
| ----------------- | ------------------- | ------------------------------------------ |
| tree-engine.ts    | Semantically identical | A has explicit `FlattenedNode` import, `TreeEngineProjection` return types. B omits them (7 line diffs, all type annotations). |
| visibility.ts     | Semantically identical | A imports `TreeMatchRange` and has explicit return type. B omits (3 line diffs). |
| paging.ts         | **IDENTICAL**       |                                            |
| selection.ts      | **IDENTICAL**       |                                            |
| expansion.ts      | **IDENTICAL**       |                                            |
| flattening.ts     | **IDENTICAL**       |                                            |
| loading.ts        | **IDENTICAL**       |                                            |
| navigation.ts     | Semantically identical | A has generic `<T>` on `findVisibleIndexById`. B omits (2 line diffs). |
| node-index.ts     | **IDENTICAL**       |                                            |
| types.ts          | **IDENTICAL**       |                                            |
| utils.ts          | **IDENTICAL**       |                                            |

**Decision:** Take A for tree-engine.ts, visibility.ts, navigation.ts (more explicit typing). All others already identical.

#### Type Files

| File                    | Status        | Notes                        |
| ----------------------- | ------------- | ---------------------------- |
| tree-adapter.ts         | **IDENTICAL** |                              |
| tree-config.ts          | **IDENTICAL** |                              |
| tree-node.ts            | **IDENTICAL** |                              |
| tree-filter.ts          | **IDENTICAL** |                              |
| tree-errors.ts          | **IDENTICAL** |                              |
| tree-context-action.ts  | **IDENTICAL** |                              |
| tree-pagination.ts      | **IDENTICAL** |                              |
| tree-pinned.ts          | **IDENTICAL** |                              |
| tree-events.ts          | **A-only**    | Angular-specific event types. Correctly moved to tree-explorer's `tree.types.ts`. |

#### Utils

| File                   | Status        | Notes |
| ---------------------- | ------------- | ----- |
| tree-utils.ts          | **IDENTICAL** |       |
| tree-adapter.utils.ts  | **IDENTICAL** |       |
| object-tree-adapter.ts | **A-only**    | Exists in tree-explorer as `adapters/index.ts` (equivalent). |

#### Service (tree.service.ts)

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Import paths | Expected difference | A: relative `../../core`; B: `@tree-core` + `../tokens/tree.configs` |
| `rootLoadingState` computed | **A has it, B does not** | A has `public readonly rootLoadingState = computed(() => this.rootLoading())` |
| `shouldDisablePaging` optimization | **B has it, A does not** | B checks if first page returns ALL items and disables paging, falling back to `setChildrenLoaded`. This is a refinement. |
| `totalCount` recalculation | **B has it, A does not** | B uses debug state to compute `Math.max(debug.totalCount, totalCount)`. |
| Return type annotations | A more explicit | `getPagedNodeDebugState` has explicit `TreePagedNodeDebugState` return type in A. |

**Decision:** Take B (tree-explorer's version is more evolved). Cherry-pick `rootLoadingState` computed signal from A if missing in B. Port explicit return types from A.

#### Components

| File | Diff count | Nature of diffs |
| ---- | ---------- | --------------- |
| tree-explorer.component.ts | 104 diffs | Major structural differences: B uses `@tree-core` imports, has `styleUrls` including `tree-theme.css`, different selector (`tree-explorer` vs A's selector), refined effects. |
| tree-explorer.component.html | 121 diffs | B has `mat-progress-bar` loading indicator, restructured pinned section with expanded DnD, different template vars. |
| tree-explorer.component.scss | 83 diffs | B has CSS custom property system (`var(--tree-*)`), loading bar styles, refined pinned section CSS. |
| tree-item.component.ts | 42 diffs | B has different selector (`td-tree-item`), refined computed signals. |
| tree-item.component.html | 130 diffs | B has restructured template with loading/error states, expanded accessibility attributes. |
| tree-item.component.scss | 252 diffs | B has full CSS custom property theming system, shimmer animations, state-based styles. |
| highlight-filter.pipe.ts | 13 diffs | Minor: import paths and formatting. |

**Decision:** Take B for all component files. B is the evolved Covalent-integrated version with design-system theming.

#### B-only Files (tree-explorer enhancements)

| File | Purpose |
| ---- | ------- |
| `async-tree.component.ts` | Thin compatibility wrapper (selector: `async-tree`) |
| `data-explorer-compat.component.ts` | Legacy compat wrapper (selector: `td-tree`) |
| `tree-explorer.module.ts` | NgModule for backward compat (`forRoot`/`forFeature`) |
| `tree.types.ts` | Angular event type re-exports from `@tree-core` |
| `tree.utils.ts` | `findInTree()` stub |
| `tree.configs.ts` (tokens) | InjectionToken with factory |
| `adapters/index.ts` | ObjectTreeAdapter + TreeAdapter re-export |
| `presets/index.ts` | TODO stubs (FileExplorer, OrgChart, Permissions) |
| `styles/tree-theme.css` | 66 CSS custom properties theming contract |
| 13 story files | Storybook coverage |
| 4 spec files | Service + component + pipe specs |

#### A-only Files (async-tree unique)

| File | Disposition |
| ---- | ----------- |
| `tree-events.ts` (types) | Equivalent is in tree-explorer's `tree.types.ts` |
| `object-tree-adapter.ts` (utils) | Equivalent is in tree-explorer's `adapters/index.ts` |
| `tree.configs.ts` (DI token) | Equivalent is in tree-explorer's `tokens/tree.configs.ts` |
| Spec files (core engine) | Equivalents exist in tree-core |
| Spec files (service/component) | Equivalents exist in tree-explorer |

---

### 0.3 Docs Drift Report

#### Documents Inventoried

| Document | Exists | Location |
| -------- | ------ | -------- |
| Root README | ✅ | `README.md` |
| tree-core README | ✅ | `packages/tree-core/README.md` |
| tree-explorer README | ✅ | `packages/tree-explorer/README.md` |
| tree-explorer BUILD.md | ✅ | `packages/tree-explorer/BUILD.md` |
| Architecture | ✅ | `docs/architecture.md` |
| Filtering | ✅ | `docs/filtering.md` |
| Monorepo Workflow | ✅ | `docs/monorepo.md` |
| Page-Aware Virtual Scroll | ✅ | `docs/page-aware-virtual-scroll.md` |
| Pinned Items | ✅ | `docs/pinned-items.md` |
| Quality Report | ✅ | `docs/quality-report.md` |
| Theming | ✅ | `docs/theming.md` |
| TreeEngine Audit | ✅ | `docs/tree-engine-audit.md` |
| **Next Steps** | ❌ | Referenced in README + tree-explorer README but **does not exist** |
| **Filtering Review** | ❌ | Referenced in README + tree-core README but **does not exist** (`filtering.md` exists instead) |

#### Docs Claim vs Implementation Reality

**1. Root README**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| Links to `docs/next-steps.md` | File does not exist | ❌ **BROKEN LINK** |
| Links to `docs/filtering-review.md` | File is `docs/filtering.md` | ❌ **WRONG FILENAME** |
| "Lit wrapper POC with core parity for filtering input" | Lit package exists but is a POC | ✅ Accurate |
| Quickstart shows `TreeExplorerComponent` from `@tree-explorer` | Correct import path | ✅ Accurate |
| Workspace commands list `pnpm docs:check` | Script exists | ✅ Accurate |
| Platform baseline: Angular 19.2.x | Matches package.json | ✅ Accurate |

**2. tree-core README**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| Links to `docs/filtering-review.md` | File is `docs/filtering.md` | ❌ **WRONG FILENAME** |
| "Framework-agnostic engine" | No Angular/framework imports in tree-core | ✅ Accurate |
| Adapter contract documented | Matches `tree-adapter.ts` interface | ✅ Accurate |
| Pagination contract documented | Matches `tree-pagination.ts` | ✅ Accurate |
| Pinned contract documented | Matches `tree-pinned.ts` | ✅ Accurate |
| `TreeEngine` API methods documented | Matches public API surface | ✅ Accurate |
| "peerDep on rxjs ~7.8.0" | Matches package.json | ✅ Accurate |
| Migration notes on `isLeaf` precedence | Matches `visibility.ts` implementation | ✅ Accurate |

**3. tree-explorer README**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| Links to `docs/next-steps.md` | File does not exist | ❌ **BROKEN LINK** |
| "Angular wrapper for @tree-core" | Correct | ✅ Accurate |
| Component API section (inputs/outputs) | Matches `tree-explorer.component.ts` | ✅ Accurate |
| "Pinned shortcuts are optional and disabled by default" | Matches `DEFAULT_TREE_CONFIG` | ✅ Accurate |
| Highlight pipe documented with tokens | Matches `highlight-filter.pipe.ts` | ✅ Accurate |
| "Lit wrapper note" at bottom | Accurate POC warning | ✅ Accurate |

**4. BUILD.md**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| "Angular CLI 17+" prerequisite | Workspace uses Angular 19.2.x, pnpm scripts | ⚠️ **MISLEADING** (should say Angular 19.2+, pnpm build) |
| `ng build tree-explorer` command | Workspace uses `pnpm build` which calls `ng-packagr` | ⚠️ **MISLEADING** |
| Build output shows `bundles/` UMD directory | ng-packagr for Angular 19 no longer produces UMD bundles | ❌ **OUTDATED** |
| Compatibility matrix lists Angular 17.x/18.x as supported | Only Angular 19.2.x is tested | ⚠️ **UNVERIFIED CLAIM** |
| "Bundle sizes: UMD ~45KB, ESM ~35KB, Tree-shaken ~15KB" | No evidence these are measured | ❌ **UNVERIFIED** |
| Core Exports table lists `BaseTreeAdapter` | No `BaseTreeAdapter` exists in codebase | ❌ **WRONG** |
| Core Exports table lists `TreeItem<T>`, `FlatTreeItem<T>` | These types don't exist; real types are `TreeNode<T>`, `TreeRowViewModel<T>` | ❌ **WRONG TYPE NAMES** |
| References Angular Material as dependency | Not a direct dependency | ⚠️ **MISLEADING** |

**5. docs/architecture.md**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| System boundaries diagram | Matches actual package separation | ✅ Accurate |
| Engine module data flow | Matches engine module structure | ✅ Accurate |
| Sequence diagrams (expand/load/page, pinned nav) | Matches service + engine implementation | ✅ Accurate |
| API overview table | Matches public exports | ✅ Accurate |
| `isLeaf` precedence | Matches visibility.ts implementation | ✅ Accurate |
| Edge cases & failure modes | Matches TreeLoadError types | ✅ Accurate |
| Storybook recipe file pointers | All point to existing story files | ✅ Accurate |

**6. docs/filtering.md**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| Filter modes (`client`, `hybrid`, `server`) | Matches `TreeFilterMode` type | ✅ Accurate |
| `setFilter`/`clearFilter`/`reapplyFilter` signatures | Match engine API | ✅ Accurate |
| Config fields documented | Match `TreeFilteringConfig` | ✅ Accurate |
| Behavior flow diagram | Matches visibility.ts logic | ✅ Accurate |

**7. docs/quality-report.md**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| "Documentation and architecture diagrams are aligned with the current implementation" | Mostly true, except broken links | ⚠️ **MOSTLY ACCURATE** (broken doc links exist) |
| Validation gate commands | Correct commands | ✅ Accurate |
| "documentation drift risk: Low" | Two broken links + BUILD.md has significant drift | ⚠️ **UNDERSTATED** |

**8. docs/tree-engine-audit.md**

| Claim | Reality | Drift? |
| ----- | ------- | ------ |
| Module decomposition complete | Confirmed by file inventory | ✅ Accurate |
| Cache mechanisms described | Match tree-engine.ts implementation | ✅ Accurate |
| Public API surface list | Match tree-engine.ts exports | ✅ Accurate |
| Hot path complexity analysis | Matches code structure | ✅ Accurate |

#### Docs Drift Summary

| Severity | Item | Location | Fix |
| -------- | ---- | -------- | --- |
| 🔴 Critical | `docs/next-steps.md` referenced but missing | `README.md` L103, L110; `tree-explorer/README.md` L12 | Create file or remove references |
| 🔴 Critical | `docs/filtering-review.md` referenced but wrong filename | `README.md` L105, L109; `tree-core/README.md` L8 | Change to `docs/filtering.md` |
| 🔴 Critical | BUILD.md lists `BaseTreeAdapter` as export | `packages/tree-explorer/BUILD.md` L87 | Replace with `ObjectTreeAdapter` |
| 🔴 Critical | BUILD.md lists wrong type names (`TreeItem<T>`, `FlatTreeItem<T>`) | `packages/tree-explorer/BUILD.md` L93-95 | Replace with `TreeNode<T>`, `TreeRowViewModel<T>`, `TreeConfig<T>` etc. |
| 🟡 Medium | BUILD.md UMD bundle reference outdated | `packages/tree-explorer/BUILD.md` L49,L96-98 | Remove UMD references; ng-packagr 19 produces ESM only |
| 🟡 Medium | BUILD.md says `ng build tree-explorer` | `packages/tree-explorer/BUILD.md` L12 | Replace with `pnpm build` |
| 🟡 Medium | BUILD.md Angular version compat matrix unverified | `packages/tree-explorer/BUILD.md` L75-80 | Update to reflect actual tested versions |
| 🟢 Low | Quality report understates doc drift risk | `docs/quality-report.md` | Update after fixes |

---

## PHASE 1 — Port Plan

### 1.1 Port Boundary Definition

The port moves canonical engine logic from `packages/async-tree` into `packages/tree-core` and `packages/tree-explorer`, preserving:
- Framework-agnostic engine in `tree-core`
- Angular wrapper + Covalent DS integration in `tree-explorer`
- Public API surface stability for all consumers

### 1.2 Port Plan Table

| Source (async-tree) | Target | Decision | Rationale |
| ------------------- | ------ | -------- | --------- |
| **Engine files** | | | |
| `core/engine/tree-engine.ts` | `tree-core/src/lib/engine/tree-engine.ts` | **Take A** | A has more explicit type annotations (`FlattenedNode` import, `TreeEngineProjection` return type) |
| `core/engine/visibility.ts` | `tree-core/src/lib/engine/visibility.ts` | **Take A** | A has explicit `TreeMatchRange` import and return type |
| `core/engine/navigation.ts` | `tree-core/src/lib/engine/navigation.ts` | **Take A** | A has generic `<T>` on `findVisibleIndexById` |
| `core/engine/paging.ts` | `tree-core/src/lib/engine/paging.ts` | Already identical | No action |
| `core/engine/selection.ts` | `tree-core/src/lib/engine/selection.ts` | Already identical | No action |
| `core/engine/expansion.ts` | `tree-core/src/lib/engine/expansion.ts` | Already identical | No action |
| `core/engine/flattening.ts` | `tree-core/src/lib/engine/flattening.ts` | Already identical | No action |
| `core/engine/loading.ts` | `tree-core/src/lib/engine/loading.ts` | Already identical | No action |
| `core/engine/node-index.ts` | `tree-core/src/lib/engine/node-index.ts` | Already identical | No action |
| `core/engine/types.ts` | `tree-core/src/lib/engine/types.ts` | Already identical | No action |
| `core/engine/utils.ts` | `tree-core/src/lib/engine/utils.ts` | Already identical | No action |
| **Type files** | | | |
| All `core/types/*` | `tree-core/src/lib/types/*` | Already identical | No action |
| `core/types/tree-events.ts` | `tree-explorer/src/lib/types/tree.types.ts` | **Keep B** | B correctly re-exports from `@tree-core` and defines Angular-specific event types |
| **Utils** | | | |
| `core/utils/tree-utils.ts` | `tree-core/src/lib/utils/tree-utils.ts` | Already identical | No action |
| `core/utils/tree-adapter.utils.ts` | `tree-core/src/lib/utils/tree-adapter.utils.ts` | Already identical | No action |
| `core/utils/object-tree-adapter.ts` | `tree-explorer/src/lib/adapters/index.ts` | **Keep B** | B version re-exports TreeAdapter and is properly placed |
| **Service** | | | |
| `core/services/tree.service.ts` | `tree-explorer/src/lib/services/tree.service.ts` | **Merge** | Take B's evolved logic (shouldDisablePaging, totalCount recalculation) + add A's rootLoadingState if missing + explicit return types from A |
| **DI Token** | | | |
| `core/tree.configs.ts` | `tree-explorer/src/lib/tokens/tree.configs.ts` | **Keep B** | B version properly placed, uses `@tree-core` imports |
| **Components** | | | |
| `explorer/components/tree-explorer/*` | `tree-explorer/src/lib/components/tree-explorer/*` | **Keep B** | B is evolved with CSS custom properties, loading bar, refined DnD |
| `explorer/components/tree-item/*` | `tree-explorer/src/lib/components/tree-item/*` | **Keep B** | B has complete theming system |
| **Pipe** | | | |
| `explorer/pipes/highlight-filter.pipe.ts` | `tree-explorer/src/lib/pipes/highlight-filter.pipe.ts` | **Keep B** | Minor import path diffs only |
| **Spec files** | | | |
| All engine specs | `tree-core/src/lib/engine/*.spec.ts` | **Take A** if any differ | Verify spec parity |
| Service/component specs | `tree-explorer/src/lib/**/*.spec.ts` | **Keep B** | B specs test B's evolved surface |
| **B-only files** | | | |
| — | `async-tree.component.ts` | **Keep** | Compat wrapper |
| — | `data-explorer-compat.component.ts` | **Keep** | Legacy compat wrapper |
| — | `tree-explorer.module.ts` | **Keep** | NgModule backward compat |
| — | `styles/tree-theme.css` | **Keep** | Theming contract |
| — | `presets/index.ts` | **Keep** | Future expansion stubs |
| — | All story files | **Keep** | Testing coverage |

### 1.3 Execution Steps

1. Copy A's more-typed engine files → tree-core (3 files: tree-engine.ts, visibility.ts, navigation.ts)
2. Verify tree-core builds
3. Merge rootLoadingState into tree-explorer's service if missing
4. Verify tree-explorer builds
5. Run all tests
6. Run storybook build

---

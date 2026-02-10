# Next Steps

This roadmap is architecture-first and optimized for large datasets, virtualization correctness, and adapter-owned domain logic.

## Shared Vocabulary

- `TreeEngine`: state and policy orchestration layer.
- `TreeNode`: normalized engine node state.
- `TreeAdapter`: domain-aware mapping and API boundary.
- `Filtering`: query-to-visibility pipeline.
- `Page-Aware Virtual Scrolling`: placeholder-backed paging for stable virtualization.

## Near-Term Delivery Checklist

Completed recently:

1. Pinned section (star/unstar, reorder, navigate-to-original) with optional store hooks.
2. Query filtering lifecycle and cookbook coverage.
3. Theme token contract (`--tree-*`) across Angular and Lit wrappers.

Next delivery targets:

1. Add combined filtering + page-aware integration tests.
2. Add query-performance instrumentation and thresholds.
3. Add integration tests for pinned store failures (load/add/remove/reorder rollback behavior).
4. Add themed Storybook variants (light/dark/high-contrast) for cookbook stories.

## Filtering Roadmap

### Simple client-side search

Recommended when all relevant nodes are already loaded.

- Keep matching in adapter (`matches` or `getSearchText`).
- Keep filtering in `TreeEngine`; never in row components.
- Use wrapper-level debounce if filter is user-typed and high frequency.

### Structured filters

Recommended when query semantics include fields/tokens/flags.

- Extend `TreeFilterQuery` with product-specific fields.
- Keep policy decisions explicit:
  - `showParentsOfMatches`
  - `autoExpandMatches`
  - `selectionPolicy`
- Expose highlight ranges for deterministic rendering.
- Ensure any new filter UI states (chips, badges, counters) define `--tree-*` tokens before shipping.

### Server-side filtering with pagination

Recommended for datasets too large for in-memory traversal.

- Push filter query to adapter/API.
- Return deterministic ordering and stable IDs per parent.
- Preserve placeholder semantics for viewport geometry.
- Treat client-side filtering as optional refinement over loaded pages.
- Keep query status/loading/error visuals themeable via token contract.

Cookbook stories:

- [Filtering cookbook stories](../packages/tree-explorer/src/stories/tree-explorer.filtering-cookbook.stories.ts) (includes live search bar + play-tests)
- [Baseline filtering stories](../packages/tree-explorer/src/stories/tree-explorer.filtering.stories.ts)
- [Pinned cookbook story](../packages/tree-explorer/src/stories/tree-explorer.pinned-cookbook.stories.ts)

## Pinned Items Roadmap

Implemented now:

- Root-level pinned section (`TreeConfig.pinned.enabled`).
- Star/Unstar via centralized container context menu.
- Navigate to original node (expand loaded path + scroll + select/focus when available).
- Optional `TreePinnedStore` hooks for GET/POST/DELETE/reorder.

Next increments:

1. Add stale-node recovery policy hooks (auto-remove vs warn vs keep).
2. Add bounded bulk operations (`pinAllVisible`, `clearPinned`) behind explicit config.
3. Evaluate optional `expandable` pinned shortcuts with strict depth/perf limits.
4. Add explicit pinned-state theme tokens for stale and loading entries.

## Theming Roadmap

Implemented now:

1. Shared `--tree-*` contract for Angular and Lit wrappers.
2. Highlight token migration with backward-compatible aliases (`--td-tree-highlight-*`).
3. Hardcoded visual values in core components replaced by tokenized styling where sensible.

Next increments:

1. Tokenize remaining Storybook cookbook container chrome (demo wrappers).
2. Add tokens for context-menu states and drag/drop affordances.
3. Publish dark and high-contrast preset snippets.
4. Add a visual-regression pass for theme variants.

## Adapter Techniques

- Stable ID strategy:
  - `getId` must be globally stable and deterministic.
- Domain projection:
  - use `toData` / `transform` for normalized view model inputs.
- Matching ownership:
  - use `matches(data, query)` for domain semantics.
- Pagination ownership:
  - keep backend contracts inside adapter (`getPagination`, `loadChildren`).

## Responsibility Boundaries

- Adapter:
  - domain mapping, API protocol, match semantics.
- Engine:
  - filtering/selection/expansion/loading state machine.
- UI wrapper:
  - rendering, viewport wiring, user interaction events.
  - consuming `--tree-*` theme tokens for visuals.

## Angular Platform Strategy

### Baseline policy

- Maintain Angular `19.2.x` as the workspace baseline until a planned upgrade window.
- Keep docs, examples, and CI assumptions aligned to Angular 19 behavior.

### Angular 20 stable APIs to evaluate

The following Angular 20 APIs are stable and useful for this codebase:

1. `linkedSignal` (stable since v20.0)
   - Potential use: derive filter state snapshots and policy-driven view state with controlled writable signal behavior.
2. Signal primitives and signal-based component APIs (graduated to stable in Angular v20 roadmap)
   - Potential use: simplify wrapper/service reactivity and reduce cross-layer glue code.
3. `provideZonelessChangeDetection` (stable since v20.2)
   - Potential use: reduce ZoneJS coupling and tighten signal-driven change detection paths.
4. Incremental hydration (stable in v20 roadmap)
   - Potential use for SSR deployments that need tree interactivity with lower hydration cost.

References:

- Angular roadmap (stability milestones): https://angular.dev/roadmap
- `linkedSignal` API: https://angular.dev/api/core/linkedSignal
- `provideZonelessChangeDetection` API: https://angular.dev/api/core/provideZonelessChangeDetection

### Suggested adoption sequence

1. Upgrade branch to Angular 20 while keeping public APIs unchanged.
2. Validate Storybook + typecheck + docs check + browser tests.
3. Pilot zoneless in Storybook/test environment before production enablement.
4. Introduce `linkedSignal` only where it reduces complexity measurably.

## Anti-Patterns to Avoid

- Filtering in row templates/components.
- Mixing incompatible filtering logic across host, wrapper, and adapter.
- Using unstable IDs in any filtered/paged path.
- Introducing Angular 20-only patterns on the mainline before baseline upgrade planning.
- Shipping new UI without adding/using theme tokens.

## Feature Checklist (Required)

When adding a feature:

1. Define the requirement and expected behavior boundaries.
2. Decide ownership (adapter vs engine vs wrapper).
3. Define/update `--tree-*` tokens for any new visual states.
4. Add/update tests (unit or Storybook interaction) for behavior and regressions.
5. Add Storybook coverage for at least one themed variant.
6. Update docs (`architecture`, `next-steps`, and feature doc) before merge.

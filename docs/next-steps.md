# Next Steps

This roadmap is architecture-first and optimized for large datasets, virtualization correctness, and adapter-owned domain logic.

## Current Status Checklist

- [x] Core query filtering contract implemented.
- [x] Angular wrapper `filterQuery` input implemented.
- [x] Lit POC filter parity implemented.
- [x] Filtering stories added.
- [x] Docs hub and architecture docs refreshed.
- [x] Filter-aware `selectRange` behavior in core/service paths.
- [ ] Server-side filtering contract examples in core docs/stories.

## Near-Term Delivery Checklist

1. Add a server-side filtering cookbook with paginated API examples.
2. Add hybrid mode cookbook showing loaded-node + fetch strategy boundaries.
3. Add combined filtering + page-aware integration tests.
4. Add query-performance instrumentation and thresholds.

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

### Server-side filtering with pagination

Recommended for datasets too large for in-memory traversal.

- Push filter query to adapter/API.
- Return deterministic ordering and stable IDs per parent.
- Preserve placeholder semantics for viewport geometry.
- Treat client-side filtering as optional refinement over loaded pages.

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

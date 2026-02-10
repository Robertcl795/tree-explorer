# Next Steps

This roadmap prioritizes architecture stability, adapter-first extensibility, and large-tree performance.

## Filtering Roadmap

### Recommended Path: Simple Client-Side Search

Use when:

- All relevant nodes are already loaded in memory.
- Fast incremental text filtering is needed.

Path:

1. Introduce core filter state (`setFilter`, `clearFilter`) with typed `FilterQuery`.
2. Keep matching logic in adapter (`getSearchText` or `matches`).
3. Run filtering in core row derivation, not in row components.
4. Apply debounce and cancel stale computations for input-driven updates.

### Recommended Path: Structured Filters

Use when:

- Query has fields, tokens, flags, and non-trivial semantics.

Path:

1. Define `FilterQuery` shape in core types.
2. Support composable criteria evaluation in engine with adapter-owned field extraction/matching.
3. Add behavior flags:
   - include ancestors on descendant match
   - auto-expand matches
   - selection behavior under filtering
4. Add row-level match metadata for highlighting.

### Recommended Path: Server-Side Filtering with Pagination

Use when:

- Dataset is too large for client-only filtering.
- Backend is source of truth for query and ordering.

Path:

1. Delegate query to adapter/API (`loadChildren` with filter context).
2. Keep page-aware placeholders and `totalCount` handling for virtualization integrity.
3. Treat local filtering as a refinement over loaded data only when explicitly enabled.
4. Preserve deterministic ordering per parent to avoid scroll jump and selection drift.

### Anti-Patterns to Avoid

- Filtering in `TreeItemComponent` or row template.
- Running full-tree domain scans directly in Angular view effects.
- Applying conflicting filters in adapter, host component, and wrapper at once.
- Using unstable IDs in filtered results (breaks selection and virtualization).

## Adapter Techniques

### Domain Mapping and Stable ID Strategy

- `getId` must be globally stable for each node identity.
- Use `toData` for domain normalization before UI logic.
- Keep label/icon/visibility logic deterministic for a given domain object + query context.

### Computed Label, Icon, Disabled, Visible

- Adapter should own:
  - `getLabel`
  - `getIcon`
  - `isDisabled`
  - domain matching hooks (`isVisible` today, `matches` in target model)
- Engine should own:
  - selection, expansion, flattening, pagination placeholders, and filter orchestration.
- UI should own:
  - rendering, events, and lightweight interaction behavior only.

### Lazy Loading and Page-Aware Pagination

- Keep `getPagination` and `loadChildren` in adapter for backend protocol concerns.
- Preserve placeholder semantics to keep viewport metrics stable.
- Ensure consistent backend ordering for each parent across requests.

### Context Action Composition

- Keep action definitions in `TreeConfig.actions`.
- Use adapter/domain state to determine action visibility and disablement predicates.
- Avoid embedding action policy directly in row renderers.

## Where Logic Belongs

- Adapter:
  - domain projection, backend query translation, matching semantics.
- Engine:
  - state machine, filtering lifecycle, expansion/selection rules, virtualization-safe derivation.
- UI wrapper:
  - viewport wiring, event dispatch, menu presentation, keyboard and focus UX.

## Implementation Guidance Checklist

1. Define requirement and expected behavior (including performance bounds).
2. Decide ownership: engine concern vs adapter concern vs UI concern.
3. Update core types/contracts first, then adapters, then wrappers.
4. Add/adjust tests for correctness and performance-sensitive paths.
5. Add/update Storybook story to demonstrate behavior.
6. Update architecture docs and diagrams in the same change.
7. Run docs and package checks before merge.

## Lit POC Parity Goals

- Keep filtering contract wrapper-agnostic (`@tree-core` first).
- Ensure Angular and Lit wrappers consume the same row-level filtering outputs.
- Avoid wrapper-specific filter semantics that cannot be mirrored cross-framework.


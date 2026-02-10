# Next Steps

This roadmap is updated after the TreeEngine modularization/performance/docs cycle.

## Completed in This Cycle

1. TreeEngine decomposed into focused modules with a facade orchestrator.
2. Projection + flatten caches added to cut repeated recomputation on read-heavy paths.
3. Paging patch path optimized to update only affected indices when branch shape is unchanged.
4. Adapter leaf override finalized with precedence:
   - `adapter.isLeaf(data, ctx?)`
   - `node.isLeaf`
   - default heuristic
5. Storybook reorganized by feature:
   - `Tree/Basic Usage`
   - `Tree/Virtual scroll`
   - `Tree/Virtual scroll/Page aware`
   - `Tree/Filtering (100+ elements)`
   - `Tree/Pinned items`
   - `Tree/Errors & edge cases`
6. Feature docs and architecture diagrams aligned to runtime behavior.

## Shared Vocabulary

- `TreeEngine`: state and policy orchestration layer.
- `TreeNode`: normalized engine node state.
- `TreeAdapter`: domain-aware mapping and API boundary.
- `Projection`: row view model derivation pipeline in `visibility.ts`.
- `Page-Aware Virtual Scrolling`: placeholder-backed paging for stable viewport geometry.

## Immediate Priorities (P0)

1. Add integration tests for combined scenarios:
   - filtering + page-aware pagination
   - pinned navigation + page-aware loading
   - filter policies + selection behavior (`clearHidden` vs `keep`)
2. Add perf guardrails for large loaded trees:
   - projection cache hit-rate tracking
   - filter recompute timing thresholds
3. Add Storybook interaction assertions for:
   - `Tree/Pinned items` success/failure navigation
   - `Tree/Virtual scroll/Page aware` page-level retry behavior

## Near-Term Improvements (P1)

1. Tighten compatibility surface and migration posture:
   - mark `TreeEngine.getVisibleRows` alias as compatibility-only in API docs
   - mark `pinned.ids` as compatibility-only and keep `entries` as the primary path
2. Add dedicated accessibility checks for:
   - keyboard navigation in pinned section
   - focus ring visibility across theme variants
   - error announcement behavior in edge-case stories
3. Tokenize remaining Storybook demo chrome where possible so examples use the same theming contract as runtime components.

## Strategic Work (P2)

1. Evaluate index-assisted filtering for very large loaded datasets where O(n) recompute becomes visible.
2. Evaluate Angular 20 adoption branch once baseline constraints are cleared:
   - keep public APIs stable
   - run typecheck + Storybook build + docs check + browser tests
3. Add optional observability hooks for product teams:
   - page request counts
   - navigation failure reasons
   - filter latency metrics

## Storybook Validation Targets

- `Tree/Basic Usage`
  - Normal
  - Lazy load (100 items)
- `Tree/Virtual scroll`
  - Normal (1000 items, 4 levels nest)
- `Tree/Virtual scroll/Page aware`
  - Root level (10000 items)
  - (1000 users, 1000 posts)
  - 3 levels (100 countries, 1000 users, 1000 posts)
- `Tree/Filtering (100+ elements)`
  - Client mode
  - Hybrid
  - Server: Direct matches
  - Server: Clear hidden selection policy
- `Tree/Pinned items`
  - Nested auto navigation (4 levels, 125 items)
  - Nested auto navigation: load failure
- `Tree/Errors & edge cases`

## Release Gate (Recommended)

```bash
pnpm typecheck
pnpm docs:check
pnpm storybook:build
pnpm --filter @tree-core test
pnpm --filter @tree-explorer test
```

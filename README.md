# td-tree-explorer

Monorepo for a library-grade tree system with framework-agnostic core logic and UI wrappers.

## Packages

- `@tree-core`
  - Framework-agnostic types, adapter contract, and `TreeEngine` orchestration.
  - Includes page-aware virtualization primitives (pagination contracts, placeholders, range orchestration).
- `@tree-explorer`
  - Angular wrapper with CDK virtualization, container-level context menu, and adapter-driven rendering.
- `@lit-tree-explorer`
  - Lit web-component proof of concept.

## Philosophy

1. Start from data source constraints and UX requirements.
2. Keep domain logic in adapters.
3. Keep state/orchestration in `TreeEngine`.
4. Keep row UI dumb and cheap.

## Workspace Commands (Root)

- Install: `pnpm install`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`
- Storybook dev (Angular): `pnpm storybook`
- Storybook build (Angular): `pnpm storybook:build`
- Lit build (optional): `pnpm build:lit`
- Lit Storybook (optional): `pnpm storybook:lit`
- Docs check: `pnpm docs:check`
- Clean: `pnpm clean`

## Documentation

- Monorepo setup: `docs/monorepo.md`
- Architecture: `docs/architecture.md`
- Filtering review: `docs/filtering-review.md`
- Next steps roadmap: `docs/next-steps.md`
- Page-aware virtual scrolling: `docs/page-aware-virtual-scroll.md`
- Quality assessment: `docs/quality-report.md`
- Angular package usage: `packages/tree-explorer/README.md`
- Core API reference: `packages/tree-core/README.md`

## Data Flow

```text
Domain Source -> TreeAdapter -> TreeNode graph -> TreeEngine -> TreeRowViewModel -> UI wrapper
```

## Current Validation Status

- `pnpm build`: passing
- `pnpm typecheck`: passing
- `pnpm lint`: passing
- `pnpm storybook:build`: passing
- `pnpm test`: blocked in this environment (no Chrome binary for Karma)

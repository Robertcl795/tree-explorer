# td-tree-explorer

Monorepo for a tree engine and Angular host built for large datasets, deterministic behavior, and adapter-boundary discipline.

## Core Architecture

- `TreeAdapter` is the only domain boundary.
- `TreeEngine` owns orchestration/state transitions.
- `TreeExplorerComponent` is the single Angular entry point.
- Rendering is selector-driven with `totalCount` and `rowAt(index)`.
- Async behavior is command-based with `epoch` + `requestId` stale protection.

## Quick Start

```bash
pnpm install
pnpm typecheck
pnpm test
```

## Documentation

Start with the canonical index:

- [`docs/README.md`](./docs/README.md)

## Workspace Commands

- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm storybook`
- `pnpm storybook:build`

## Packages

- `@tree-core`: framework-agnostic engine/contracts.
- `@tree-explorer`: Angular host wrapper.

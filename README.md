# td-tree-explorer

Monorepo for a library-grade tree system with a framework-agnostic core engine and UI wrappers.

## Why this library

- Large-tree support with virtualization-first design.
- Adapter-first domain integration.
- Unified state orchestration in `@tree-core`.
- Query-based filtering with backward compatibility for `isVisible`.
- Page-aware lazy loading with placeholders and range-driven page fetch.

## Feature Snapshot

- Tree state engine (`TreeEngine`) with expand/select/load/error orchestration.
- Query filtering contract:
  - `setFilter`, `clearFilter`, `getFilteredFlatList`.
  - adapter hooks: `matches`, `getSearchText`, `highlightRanges`.
- Virtualization-safe placeholders for paged children.
- Angular wrapper (`@tree-explorer`) with CDK virtual scroll.
- Lit wrapper POC (`@lit-tree-explorer`) with core parity for filtering input.
- Storybook coverage for advanced, filtering, and page-aware scenarios.

## Platform Baseline

- Angular baseline: `19.2.x` (workspace standard).
- Node: `>=18`
- pnpm: `9.x`

See [Next Steps](./docs/next-steps.md) for Angular 20 adoption opportunities.

## Quickstart

### 1) Install and validate

```bash
pnpm install
pnpm typecheck
pnpm docs:check
```

### 2) Run Storybook

```bash
pnpm storybook
```

### 3) Minimal Angular usage

```ts
import { Component, signal } from '@angular/core';
import { TreeExplorerComponent } from '@tree-explorer';
import { TreeAdapter, TreeConfig } from '@tree-core';

type Item = { id: string; name: string; children?: Item[] };

const adapter: TreeAdapter<Item, Item> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const config: Partial<TreeConfig<Item>> = {
  virtualization: { mode: 'auto', itemSize: 36 },
  filtering: { showParentsOfMatches: true, autoExpandMatches: true },
};

@Component({
  standalone: true,
  imports: [TreeExplorerComponent],
  template: `
    <tree-explorer
      [data]="data"
      [adapter]="adapter"
      [config]="config"
      [filterQuery]="query()"
      style="height: 70vh; display: block" />
  `,
})
export class DemoComponent {
  query = signal('budget');
  data: Item[] = [{ id: 'root', name: 'Root', children: [{ id: 'budget', name: 'Budget FY26.xlsx' }] }];
  adapter = adapter;
  config = config;
}
```

## Documentation Hub

### Architecture and Design

- [Architecture](./docs/architecture.md)
- [Filtering Review](./docs/filtering-review.md)
- [Page-Aware Virtual Scroll](./docs/page-aware-virtual-scroll.md)

### Quality and Planning

- [Quality Report](./docs/quality-report.md)
- [Next Steps](./docs/next-steps.md)

### Workspace and Operations

- [Monorepo Workflow](./docs/monorepo.md)

### Package Guides

- [@tree-core README](./packages/tree-core/README.md)
- [@tree-explorer README](./packages/tree-explorer/README.md)
- [@lit-tree-explorer README](./packages/lit-tree-explorer/README.md)

## Workspace Commands

- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm storybook`
- `pnpm storybook:build`
- `pnpm storybook:lit`
- `pnpm storybook:build:lit`
- `pnpm storybook:all`
- `pnpm storybook:build:all`
- `pnpm docs:check`

## Packages

- `@tree-core`: engine, contracts, utilities.
- `@tree-explorer`: Angular wrapper.
- `@lit-tree-explorer`: Lit POC wrapper.

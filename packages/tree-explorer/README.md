# @tree-explorer (Angular)

Angular wrapper for `@tree-core` with virtualized rendering, adapter-driven behavior, and container-level action/menu orchestration.

## Architectural Role

- `TreeExplorerComponent`
  - Container/orchestrator for viewport, events, and context menu.
- `TreeItemComponent`
  - Row renderer (non-domain logic).
- `TreeStateService`
  - Bridges Angular signals/events to `TreeEngine` operations.

## Usage

```ts
import { Component } from '@angular/core';
import { TreeExplorerComponent } from '@tree-explorer';
import { TreeAdapter, TreeConfig, VIRTUALIZATION_MODES } from '@tree-core';

type Item = { id: string; name: string; children?: Item[] };

const adapter: TreeAdapter<Item, Item> = {
  getId: (s) => s.id,
  getLabel: (d) => d.name,
  getChildren: (d) => d.children,
};

const config: Partial<TreeConfig<Item>> = {
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

@Component({
  standalone: true,
  imports: [TreeExplorerComponent],
  template: `<tree-explorer [data]="data" [adapter]="adapter" [config]="config" />`,
})
export class DemoComponent {
  data: Item[] = [{ id: 'root', name: 'Root', children: [{ id: 'a', name: 'A' }] }];
  adapter = adapter;
  config = config;
}
```

## Component API

### Inputs

- `data: TreeChildrenResult<TSource> | TSource[]`
- `adapter: TreeAdapter<TSource, T>`
- `config: Partial<TreeConfig<T>>`
- `loading: boolean`
- `filterQuery: TreeFilterInput`

### Outputs

- `itemClick`, `itemDoubleClick`, `itemToggleExpand`, `itemToggleSelect`
- `selectionChange`
- `contextMenuAction`
- `loadError`
- `dragStart`, `dragOver`, `drop`, `dragEnd`

## Page-Aware Virtualization Behavior

When adapter pagination is enabled for an expanded parent:

1. Initial page request loads first page and `totalCount`.
2. Engine creates fixed-length child list (`totalCount`) with placeholders.
3. CDK viewport range changes trigger `ensureRangeLoaded`.
4. Only missing pages for rendered placeholder ranges are fetched.
5. Loaded rows replace placeholders in-place, preserving stable `trackBy` IDs.

## Filtering Usage

`TreeExplorerComponent` forwards `filterQuery` to core filtering APIs.

```ts
query = signal('budget');
```

```html
<tree-explorer
  [data]="data"
  [adapter]="adapter"
  [config]="config"
  [filterQuery]="query()" />
```

Filtering remains adapter-owned for domain matching:

- use `adapter.matches(data, query)` for custom logic
- or provide `adapter.getSearchText(data)` for default text matching

## Adapter Example (Paged)

```ts
import { PageRequest, TreeAdapter } from '@tree-core';

type Node = { id: string; name: string; hasChildren?: boolean };

const adapter: TreeAdapter<Node, Node> = {
  getId: (s) => s.id,
  getLabel: (d) => d.name,
  hasChildren: (d) => !!d.hasChildren,
  getPagination: (node) =>
    node.id === 'catalog' ? { enabled: true, pageSize: 50 } : undefined,
  loadChildren: async (node, reqOrSource) => {
    const req = (reqOrSource as PageRequest) ?? { pageIndex: 0, pageSize: 50 };
    const response = await fetch(`/api/${node.id}?page=${req.pageIndex}&size=${req.pageSize}`);
    const items = await response.json();
    const totalCount = Number(response.headers.get('X-Total-Count') ?? items.length);
    return { items, totalCount };
  },
};
```

## Non-negotiable UI Rules Enforced

- Context menu actions are centralized at container level (`TreeConfig.actions`).
- Placeholders are non-selectable and non-actionable.
- `trackBy` is stable and based on row ID.

## Lit Wrapper Note

`@lit-tree-explorer` remains a POC wrapper. Keep domain logic in adapters so Angular/Lit wrappers can share behavior.

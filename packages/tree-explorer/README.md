# Tree Explorer (Angular)

Tree Explorer is the Angular wrapper for the framework-agnostic tree core. It renders a virtualized flat tree, delegates all domain logic to an adapter, and owns a single context menu at the container level.

## Architecture at a glance

```
Sources -> Adapter -> TreeNode[] -> TreeEngine -> TreeRowViewModel[] -> TreeExplorerComponent
```

- TreeExplorerComponent orchestrates virtual scroll, events, and menu rendering.
- TreeItemComponent is a dumb row renderer that receives a view model.
- TreeAdapter is the only place that knows the domain model.

## Getting started

```typescript
import { Component } from '@angular/core';
import { TreeExplorerComponent } from '@tree-explorer';
import { TreeAdapter, TreeConfig } from '@tree-core';

type DocNode = { id: string; name: string; children?: DocNode[] };

const adapter: TreeAdapter<DocNode, DocNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const config: Partial<TreeConfig<DocNode>> = {
  selection: { mode: 'single' },
  display: { indentPx: 24, density: 'normal', showIcons: true },
  virtualization: { mode: 'auto', itemSize: 36 },
};

@Component({
  selector: 'app-example',
  standalone: true,
  imports: [TreeExplorerComponent],
  template: `
    <tree-explorer
      [data]="treeData"
      [adapter]="adapter"
      [config]="config"
      (itemClick)="onItemClick($event)">
    </tree-explorer>
  `,
})
export class ExampleComponent {
  adapter = adapter;
  config = config;
  treeData: DocNode[] = [
    { id: 'root', name: 'Workspace', children: [{ id: 'doc', name: 'Report.pdf' }] },
  ];

  onItemClick(event: unknown) {
    console.log(event);
  }
}
```

## Advanced examples

### Lazy loading

```typescript
const adapter: TreeAdapter<LazyNode, LazyNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: (node) => api.fetchChildren(node.id),
};
```

### Context menu actions

```typescript
const config: Partial<TreeConfig<MyNode>> = {
  actions: [
    { id: 'open', label: (item) => `Open ${item.name}`, icon: () => 'open_in_new' },
    { id: 'delete', label: () => 'Delete', disabled: (item) => item.locked },
  ],
};
```

### Drag and drop

```typescript
const config: Partial<TreeConfig<MyNode>> = {
  dragDrop: true,
};

const adapter: TreeAdapter<MyNode, MyNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getDragData: (data) => ({ id: data.id, name: data.name }),
};
```

### Pinned rows

```typescript
const config: Partial<TreeConfig<MyNode>> = {
  pinned: { ids: ['favorites', 'recent'], label: 'Quick access' },
};
```

### Error handling

```typescript
const config: Partial<TreeConfig<MyNode>> = {
  onError: (error) => {
    // Surface the error in your app (toast, banner, telemetry)
  },
};
```

### Multi-select

```typescript
const config: Partial<TreeConfig<MyNode>> = {
  selection: { mode: 'multi', hierarchical: true },
};
```

## API overview

### Inputs

- `data`: source array (root items)
- `adapter`: `TreeAdapter<TSource, T>`
- `config`: `Partial<TreeConfig<T>>`
- `loading`: external loading flag (optional)

### Outputs

- `itemClick`: `TreeNodeEvent<T>`
- `itemDoubleClick`: `TreeNodeEvent<T>`
- `itemToggleExpand`: `TreeNodeEvent<T>`
- `itemToggleSelect`: `TreeNodeEvent<T>`
- `selectionChange`: `{ nodes: TreeNode<T>[] }`
- `contextMenuAction`: `TreeContextMenuEvent<T>`
- `loadError`: `TreeLoadError`
- `dragStart`: `TreeDragEvent<T>`
- `dragOver`: `TreeDragEvent<T>`
- `drop`: `TreeDragEvent<T>`
- `dragEnd`: `TreeDragEvent<T>`

## Performance notes

- Always provide stable ids in `TreeAdapter.getId`.
- Keep `TreeAdapter.transform` deterministic and fast.
- Use `virtualization.itemSize` that matches rendered row height.
- Define a single context menu list in `TreeConfig.actions`.

## Web component migration guidance

- Keep all domain logic inside `TreeAdapter` implementations.
- Avoid Angular-only dependencies in adapter code.
- Use `TreeConfig` for UI decisions so a Web Component wrapper can mirror behavior.

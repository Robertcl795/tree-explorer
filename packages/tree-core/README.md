# tree-core

Framework-agnostic tree engine and types. No Angular dependencies.

## Key concepts

- TreeNode: minimal, serializable node model
- TreeAdapter: contract for mapping domain sources to TreeNode
- TreeEngine: expansion, selection, flattening, and lazy-load orchestration

## Minimal adapter

```typescript
import { TreeAdapter } from '@tree-core';

type Node = { id: string; name: string; children?: Node[] };

const adapter: TreeAdapter<Node, Node> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};
```

## Lazy load support

```typescript
const adapter: TreeAdapter<LazyNode, LazyNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: (node) => api.fetchChildren(node.id),
};
```

## Guarantees

- Stable ids are required for selection and virtualization.
- `transform` and `toData` should be deterministic.
- Use `childrenIds: undefined` to indicate unknown children.

## Error handling

`TreeConfig.onError` is invoked for root or child load failures. The caller decides how to surface errors.

## Pinned and drag/drop

`TreeConfig.pinned` and `TreeConfig.dragDrop` are provided for UI wrappers to implement pinned sections and drag/drop behavior without changing core logic.

# tree-lit (POC)

A minimal Lit wrapper around tree-core. This is a scaffold-only proof of concept and is not wired into the build.

## Dependencies

- lit
- @lit-labs/virtualizer
- tree-core

## Features in the POC

- Virtualized flat tree rendering
- Adapter-driven labels/icons/visibility
- Single context menu at the container level
- Drag and drop hooks (uses adapter.getDragData)
- Pinned section navigation
- Async root loading and child loading with error reporting
- Query-driven filtering via `filterQuery`

## Usage

```ts
import { TreeAdapter, TreeConfig } from '@tree-core';
import './tree-lit';

type Node = { id: string; name: string; children?: Node[] };

const adapter: TreeAdapter<Node, Node> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const config: Partial<TreeConfig<Node>> = {
  virtualization: { mode: 'auto', itemSize: 36 },
  pinned: { ids: ['root'] },
  dragDrop: true,
};

const el = document.querySelector('td-tree-lit');
(el as any).adapter = adapter;
(el as any).config = config;
(el as any).data = [{ id: 'root', name: 'Workspace' }];
(el as any).filterQuery = 'workspace';
```

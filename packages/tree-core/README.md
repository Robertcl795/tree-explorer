# @tree-core

Framework-agnostic engine and contracts for tree rendering, selection, lazy loading, and page-aware virtualization.

## Design Intent

- Adapters own domain-specific mapping and data fetching.
- `TreeEngine` owns tree state, flattening, selection, loading/error state, and page orchestration.
- UI wrappers consume `TreeRowViewModel` and remain presentation-first.

## Core Contracts

### Adapter contract

```ts
interface TreeAdapter<TSource, T = TSource> {
  getId(source: TSource): string;
  getLabel(data: T): string;
  toData?: (source: TSource) => T;
  transform?: (source: TSource, ctx: TreeTransformContext, data: T) => TreeNode<T>;
  getIcon?: (data: T) => string | undefined;
  getDragData?: (data: T, node: TreeNode<T>) => string | Record<string, unknown>;
  isDisabled?: (data: T) => boolean;
  isVisible?: (data: T) => boolean;
  isLeaf?: (data: T) => boolean | undefined;
  hasChildren?: (data: T) => boolean | undefined;
  getChildren?: (data: T) => TSource[] | null | undefined;
  getPagination?: (node: TreeNode<T>, data?: T) => TreePaginationConfig | undefined;
  loadChildren?: (
    node: TreeNode<T>,
    reqOrSource?: PageRequest | TSource,
    data?: T,
  ) => TreeChildrenResult<TSource> | TreePagedChildrenResult<TSource>;
}
```

### Pagination contract

```ts
type TreePageIndexing = 'zero-based' | 'one-based';

interface TreePaginationConfig {
  enabled: boolean;
  pageSize: number;
  pageIndexing?: TreePageIndexing;
}

interface PageRequest {
  pageIndex: number;
  pageSize: number;
}

interface PageResult<TSource> {
  items: TSource[];
  totalCount: number;
}
```

### Placeholder semantics

- Placeholder IDs are stable: `__tree_placeholder__<parentId>__<index>`.
- Placeholders are disabled, non-selectable, non-actionable.
- Placeholders preserve scroll height until real rows replace them.

## TreeEngine API (high-value methods)

- `init(nodes)`
  - Initializes complete graph state.
- `toggleExpand(nodeId, canLoadChildren)`
  - Expands/collapses and signals whether initial load is required.
- `setChildrenLoaded(parentId, directChildren, allNodes?)`
  - Applies non-paged lazy children.
- `setPagination(parentId, config)`
  - Registers per-parent pagination behavior.
- `applyPagedChildren(parentId, request, directChildren, totalCount, allNodes?)`
  - Patches loaded page items into a fixed-length child list.
- `ensureRangeLoaded(parentId, { start, end })`
  - Returns page indices to fetch for unloaded placeholders in a range.
- `markPageInFlight`, `setPageError`, `clearPageError`
  - In-flight dedupe and page-level error tracking.
- `getVisibleRows(adapter, config)`
  - Produces flattened row view-models for wrappers.

## Examples

### Minimal eager adapter

```ts
type DocNode = { id: string; name: string; children?: DocNode[] };

const adapter: TreeAdapter<DocNode, DocNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};
```

### Paged adapter (X-Total-Count)

```ts
type ApiNode = { id: string; name: string; hasChildren?: boolean };

const adapter: TreeAdapter<ApiNode, ApiNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  getPagination: (node) =>
    node.id === 'catalog'
      ? { enabled: true, pageSize: 50, pageIndexing: 'zero-based' }
      : undefined,
  loadChildren: async (node, reqOrSource) => {
    const req = (reqOrSource as PageRequest) ?? { pageIndex: 0, pageSize: 50 };
    const response = await fetch(`/api/nodes/${node.id}?page=${req.pageIndex}&size=${req.pageSize}`);
    const items = (await response.json()) as ApiNode[];
    const totalCount = Number(response.headers.get('X-Total-Count') ?? items.length);
    return { items, totalCount };
  },
};
```

## Migration Notes

If you already use `loadChildren(node, source?, data?)`, no change is required.

To adopt page-aware loading:

1. Add `getPagination` for nodes with paged children.
2. Accept `PageRequest` in `loadChildren`.
3. Return `PageResult<TSource>` with `totalCount` from your API metadata/header.

## Guarantees

- Stable IDs are required for virtualization and selection correctness.
- No framework dependency in core logic.
- Pagination is per-parent and opt-in.

# @tree-core

Framework-agnostic engine and contracts for tree rendering, selection, lazy loading, and page-aware virtualization.

## Related Documentation

- Workspace hub: [td-tree-explorer README](../../README.md)
- Angular wrapper: [@tree-explorer README](../tree-explorer/README.md)
- Lit wrapper POC: [@lit-tree-explorer README](../lit-tree-explorer/README.md)
- Architecture: [docs/architecture.md](../../docs/architecture.md)
- Filtering: [docs/filtering.md](../../docs/filtering.md)
- Pinned items: [docs/pinned-items.md](../../docs/pinned-items.md)

## Design Intent

- Adapters own domain-specific mapping and data fetching.
- `TreeEngine` owns tree state, flattening, selection, loading/error state, paging, visibility projection, and navigation orchestration.
- UI wrappers consume `TreeRowViewModel` and remain presentation-first.

## Engine module layout

- `engine/tree-engine.ts`: facade/orchestrator.
- `engine/node-index.ts`: ancestor/descendant lookup helpers.
- `engine/flattening.ts`: flattened-node caching and traversal.
- `engine/expansion.ts`: expand/collapse and path expansion transitions.
- `engine/selection.ts`: selection transitions and range helpers.
- `engine/paging.ts`: per-parent page states, placeholder slots, page patching.
- `engine/loading.ts`: loading/error state helpers.
- `engine/visibility.ts`: query normalization, visibility, row projection.
- `engine/navigation.ts`: navigation path helpers.

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
  matches?: (data: T, query: TreeFilterQuery) => boolean;
  getSearchText?: (data: T) => string;
  highlightRanges?: (label: string, query: TreeFilterQuery) => TreeMatchRange[];
  isLeaf?: (data: T, ctx?: TreeLeafContext<T>) => boolean | undefined;
  hasChildren?: (data: T) => boolean | undefined;
  getChildren?: (data: T) => TSource[] | null | undefined;
  resolvePathToNode?: (targetId: TreeId) => TreeResolvePathResponse;
  getPagination?: (node: TreeNode<T>, data?: T) => TreePaginationConfig | undefined;
  loadChildren?: (
    node: TreeNode<T>,
    reqOrSource?: PageRequest | TSource,
    data?: T,
  ) => TreeChildrenResult<TSource> | TreePagedChildrenResult<TSource>;
}

interface TreeLeafContext<T> {
  node?: TreeNode<T>;
  parentId: TreeId | null;
  level: number;
}

interface TreeResolvePathResult {
  targetId: TreeId;
  steps: Array<{
    nodeId: TreeId;
    parentId: TreeId | null;
    pageHint?: TreePageHint;
  }>;
}
```

### Filtering contract

```ts
type TreeFilterInput = TreeFilterQuery | string | null | undefined;

interface TreeFilterQuery {
  text?: string;
  tokens?: string[];
  fields?: string[];
  flags?: Record<string, boolean>;
  caseSensitive?: boolean;
  mode?: 'contains' | 'exact';
}

type TreeFilterMode = 'client' | 'hybrid' | 'server';

interface TreeFilteringConfig {
  mode?: TreeFilterMode;
  showParentsOfMatches?: boolean;
  autoExpandMatches?: boolean;
  selectionPolicy?: 'keep' | 'clearHidden';
  keepPlaceholdersVisible?: boolean;
}
```

### Pagination contract

```ts
type TreePageIndexing = 'zero-based' | 'one-based';

interface TreePaginationConfig {
  enabled: boolean;
  pageSize: number;
  pageIndexing?: TreePageIndexing;
  initialTotalCount?: number;
}

interface PageRequest {
  pageIndex: number;
  pageSize: number;
}

interface TreePageHint {
  pageIndex: number;
  pageSize?: number;
  pageIndexing?: TreePageIndexing;
}

interface PageResult<TSource> {
  items: TSource[];
  totalCount: number;
}
```

### Pinned contract

```ts
interface TreePinnedEntry {
  entryId: string;
  nodeId: TreeId;
  label?: string;
  icon?: string;
  order: number;
  meta?: unknown;
}

interface TreePinnedStore<T> {
  loadPinned?: () => Promise<TreePinnedEntry[]> | Observable<TreePinnedEntry[]>;
  addPinned?: (node: TreeNode<T>) => Promise<TreePinnedEntry> | Observable<TreePinnedEntry>;
  removePinned?: (entry: TreePinnedEntry, node?: TreeNode<T>) => Promise<void> | Observable<void>;
  reorderPinned?: (entries: TreePinnedEntry[]) => Promise<void> | Observable<void>;
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
- `primePagedPlaceholders(parentId, totalCount)`
  - Optionally seeds placeholder slots before first successful page response.
- `applyPagedChildren(parentId, request, directChildren, totalCount, allNodes?)`
  - Patches loaded page items into a fixed-length child list.
- `ensureRangeLoaded(parentId, { start, end })`
  - Returns page indices to fetch for unloaded placeholders in a range.
- `markPageInFlight`, `setPageError`, `clearPageError`
  - In-flight dedupe and page-level error tracking.
- `setFilter(filterQuery)`, `clearFilter()`, `reapplyFilter(adapter)`
  - Filter state lifecycle and policy application.
- `expandPath(nodeId)`
  - Expands loaded ancestor path for navigation.
- `getFilteredFlatList(adapter, config)`
  - Returns filtered row view-models for wrappers.
- `selectRange(fromId, toId, adapter?, config?)`
  - Range-select rows. When adapter/config are provided, range is computed over filtered rows.

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

If you already use `adapter.isLeaf(data)`, no change is required. One-arg implementations remain valid.

Updated leaf precedence:

1. `adapter.isLeaf(data, ctx)` when it returns boolean.
2. `node.isLeaf` when present.
3. Default heuristic (`childrenIds`, `hasChildren`, load capability fallback).

To adopt query-driven filtering:

1. Call `TreeEngine.setFilter(filterQuery)` from your wrapper/service.
2. Optionally add `adapter.matches` for domain-aware filtering logic.
3. Read rows via `getFilteredFlatList(adapter, config)`.
4. Choose filtering mode in config:
   - `client` (default): core filters loaded rows.
   - `hybrid`: same as client for loaded rows; wrappers may load deeper matches.
   - `server`: adapter/API owns filtering; core skips query matching.

To adopt page-aware loading:

1. Add `getPagination` for nodes with paged children.
2. Accept `PageRequest` in `loadChildren`.
3. Return `PageResult<TSource>` with `totalCount` from your API metadata/header.

To adopt async pinned navigation to unloaded targets:

1. Implement `resolvePathToNode(targetId)` in adapter.
2. Return root->target path steps, with `pageHint` for paged parents when needed.
3. Keep wrappers thin and let service/engine orchestrate load + expand + select/focus.

## Guarantees

- Stable IDs are required for virtualization and selection correctness.
- No framework dependency in core logic.
- Pagination is per-parent and opt-in.

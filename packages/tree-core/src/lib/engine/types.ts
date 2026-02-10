import { SelectionMode, VIRTUALIZATION_MODES } from '../types/tree-config';
import { TreeFilterQuery, TreeFilteringConfig } from '../types/tree-filter';
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';

export interface TreeState<T> {
  nodes: Map<TreeId, TreeNode<T>>;
  expanded: Set<TreeId>;
  selected: Set<TreeId>;
  loading: Set<TreeId>;
  errors: Map<TreeId, unknown>;
}

export interface TreePagedNodeState {
  pageSize: number;
  pageIndexing: 'zero-based' | 'one-based';
  totalCount: number | null;
  loadedPages: Set<number>;
  inFlightPages: Set<number>;
  pageErrors: Map<number, unknown>;
}

export interface TreePagedNodeDebugState {
  pageSize: number;
  pageIndexing: 'zero-based' | 'one-based';
  totalCount: number | null;
  loadedPages: number[];
  inFlightPages: number[];
  errorPages: number[];
}

export interface TreeStats {
  total: number;
  visible: number;
  expanded: number;
  selected: number;
  loading: number;
  maxDepth: number;
}

export interface FilteredVisibilityState {
  visibleIds: Set<TreeId>;
  directMatchIds: Set<TreeId>;
}

export interface TreeEngineProjection<T> {
  orderedIds: TreeId[];
  rowsById: Map<TreeId, TreeRowViewModel<T>>;
  visibleIds: Set<TreeId>;
}

export interface TreeProjectionCache<TSource, T> {
  adapterRef: unknown;
  defaultIcon: string | undefined;
  nodesRef: Map<TreeId, TreeNode<T>>;
  expandedRef: Set<TreeId>;
  selectedRef: Set<TreeId>;
  loadingRef: Set<TreeId>;
  errorsRef: Map<TreeId, unknown>;
  filterFingerprint: string;
  filterMode: TreeFilteringConfig['mode'];
  filterConfigFingerprint: string;
  pagingVersion: number;
  projection: TreeEngineProjection<T>;
  _sourceType?: TSource;
}

export interface TreeEngineRuntimeState<T> {
  state: TreeState<T>;
  pagedChildren: Map<TreeId, TreePagedNodeState>;
  selectionMode: SelectionMode;
  virtualizationMode: VIRTUALIZATION_MODES;
  filterQuery: TreeFilterQuery | null;
  filterConfig: Required<TreeFilteringConfig>;
}

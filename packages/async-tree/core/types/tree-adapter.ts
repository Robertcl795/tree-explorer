import type { Observable } from 'rxjs';

import { TreeFilterQuery, TreeMatchRange } from './tree-filter';
import { TreeId, TreeNode } from './tree-node';
import {
  PageRequest,
  PageResult,
  TreePageHint,
  TreePaginationConfig,
} from './tree-pagination';

/** Context passed to adapter transforms during mapping. */
export interface TreeTransformContext {
  parentId: TreeId | null;
  level: number;
}

export interface TreeLeafContext<T> {
  node?: TreeNode<T>;
  parentId: TreeId | null;
  level: number;
}

export interface TreeResolvePathStep {
  nodeId: TreeId;
  parentId: TreeId | null;
  pageHint?: TreePageHint;
}

export interface TreeResolvePathResult {
  targetId: TreeId;
  steps: TreeResolvePathStep[];
}

/** Standard result shape for async or sync child loading. */
export type TreeChildrenResult<TSource> =
  | TSource[]
  | Promise<TSource[]>
  | Observable<TSource[]>;

/** Standard result shape for paginated async or sync child loading. */
export type TreePagedChildrenResult<TSource> =
  | PageResult<TSource>
  | Promise<PageResult<TSource>>
  | Observable<PageResult<TSource>>;

export type TreeResolvePathResponse =
  | TreeResolvePathResult
  | null
  | undefined
  | Promise<TreeResolvePathResult | null | undefined>
  | Observable<TreeResolvePathResult | null | undefined>;

/** Adapter contract for mapping domain sources to tree nodes. */
export interface TreeAdapter<TSource, T = TSource> {
  getId(source: TSource): TreeId;
  getLabel(data: T): string;
  toData?: (source: TSource) => T;
  transform?: (
    source: TSource,
    ctx: TreeTransformContext,
    data: T,
  ) => TreeNode<T>;
  getIcon?: (data: T) => string | undefined;
  /** Optional drag payload builder used by UI wrappers. */
  getDragData?: (data: T, node: TreeNode<T>) => string | Record<string, unknown>;
  isDisabled?: (data: T) => boolean;
  /**
   * Legacy visibility predicate retained for backward compatibility.
   * Prefer `matches` + engine filter state for query-driven filtering.
   */
  isVisible?: (data: T) => boolean;
  /**
   * Optional query-aware matcher used by engine filtering when a query is active.
   */
  matches?: (data: T, query: TreeFilterQuery) => boolean;
  /**
   * Optional search text extractor used by default contains/exact matching.
   * Falls back to getLabel when omitted.
   */
  getSearchText?: (data: T) => string;
  /**
   * Optional highlight mapping for matched label ranges.
   */
  highlightRanges?: (label: string, query: TreeFilterQuery) => TreeMatchRange[];
  /**
   * Optional leaf override. Engine precedence:
   * 1) adapter.isLeaf(data, ctx)
   * 2) node.isLeaf
   * 3) default heuristic
   */
  isLeaf?: (data: T, ctx?: TreeLeafContext<T>) => boolean | undefined;
  hasChildren?: (data: T) => boolean | undefined;
  getChildren?: (data: T) => TSource[] | null | undefined;
  /**
   * Optional path resolver used for pinned async navigation to unloaded targets.
   * Returns a root->target step list with optional page hints for paged parents.
   */
  resolvePathToNode?: (targetId: TreeId) => TreeResolvePathResponse;
  /**
   * Optional per-parent pagination contract for children loading.
   * When enabled, wrappers request pages via loadChildren with PageRequest.
   */
  getPagination?: (
    node: TreeNode<T>,
    data?: T,
  ) => TreePaginationConfig | undefined;
  loadChildren?: (
    node: TreeNode<T>,
    reqOrSource?: PageRequest | TSource,
    data?: T,
  ) => TreeChildrenResult<TSource> | TreePagedChildrenResult<TSource>;
}

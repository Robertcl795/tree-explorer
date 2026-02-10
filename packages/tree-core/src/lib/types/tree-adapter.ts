import type { Observable } from 'rxjs';

import { TreeId, TreeNode } from './tree-node';
import { PageRequest, PageResult, TreePaginationConfig } from './tree-pagination';
import { TreeFilterQuery, TreeMatchRange } from './tree-filter';

/** Context passed to adapter transforms during mapping. */
export interface TreeTransformContext {
  parentId: TreeId | null;
  level: number;
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
  isLeaf?: (data: T) => boolean | undefined;
  hasChildren?: (data: T) => boolean | undefined;
  getChildren?: (data: T) => TSource[] | null | undefined;
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

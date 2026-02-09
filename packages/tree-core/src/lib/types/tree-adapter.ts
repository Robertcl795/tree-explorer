import type { Observable } from 'rxjs';

import { TreeId, TreeNode } from './tree-node';

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
  isVisible?: (data: T) => boolean;
  isLeaf?: (data: T) => boolean | undefined;
  hasChildren?: (data: T) => boolean | undefined;
  getChildren?: (data: T) => TSource[] | null | undefined;
  loadChildren?: (
    node: TreeNode<T>,
    source?: TSource,
    data?: T,
  ) => TreeChildrenResult<TSource>;
}


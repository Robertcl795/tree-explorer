import { TreeAdapter, TreeTransformContext } from '../types/tree-adapter';
import { TreeNode } from '../types/tree-node';

export function createTreeNode<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  source: TSource,
  ctx: TreeTransformContext,
): TreeNode<T> {
  const data = adapter.toData
    ? adapter.toData(source)
    : (source as unknown as T);

  if (adapter.transform) {
    return adapter.transform(source, ctx, data);
  }
  const id = adapter.getId(source);
  const isLeaf = adapter.isLeaf ? adapter.isLeaf(data) : undefined;
  const hasChildren = adapter.hasChildren ? adapter.hasChildren(data) : undefined;
  const children = adapter.getChildren ? adapter.getChildren(data) : undefined;
  const disabled = adapter.isDisabled ? adapter.isDisabled(data) : false;

  let childrenIds: readonly string[] | undefined;
  let resolvedIsLeaf = isLeaf;

  if (typeof resolvedIsLeaf !== 'boolean') {
    if (typeof hasChildren === 'boolean') {
      resolvedIsLeaf = !hasChildren;
    } else if (Array.isArray(children)) {
      resolvedIsLeaf = children.length === 0;
      childrenIds = children.map((child) => adapter.getId(child));
    }
  }

  if (resolvedIsLeaf === true) {
    childrenIds = [];
  }

  return {
    id,
    parentId: ctx.parentId,
    level: ctx.level,
    childrenIds,
    isLeaf: resolvedIsLeaf,
    disabled,
    data,
  };
}

export function mapSourcesToNodes<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  sources: TSource[],
  parentId: string | null = null,
  level = 0,
): TreeNode<T>[] {
  return sources.map((source) =>
    createTreeNode(adapter, source, { parentId, level }),
  );
}

export interface TreeNodeGraph<T> {
  directChildren: TreeNode<T>[];
  allNodes: TreeNode<T>[];
}

/**
 * Maps sources to direct children and recursively materializes eager descendants
 * when adapter.getChildren is provided.
 */
export function mapSourcesToNodeGraph<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  sources: TSource[],
  parentId: string | null = null,
  level = 0,
): TreeNodeGraph<T> {
  const directChildren: TreeNode<T>[] = [];
  const allNodes: TreeNode<T>[] = [];

  for (const source of sources) {
    const node = createTreeNode(adapter, source, { parentId, level });
    directChildren.push(node);
    allNodes.push(node);

    const data = node.data;
    const eagerChildren = adapter.getChildren ? adapter.getChildren(data) : undefined;
    if (!Array.isArray(eagerChildren) || eagerChildren.length === 0) {
      continue;
    }

    const childGraph = mapSourcesToNodeGraph(
      adapter,
      eagerChildren,
      node.id,
      level + 1,
    );

    if (node.childrenIds === undefined) {
      node.childrenIds = childGraph.directChildren.map((child) => child.id);
    }
    if (typeof node.isLeaf !== 'boolean') {
      node.isLeaf = childGraph.directChildren.length === 0;
    }

    allNodes.push(...childGraph.allNodes);
  }

  return { directChildren, allNodes };
}

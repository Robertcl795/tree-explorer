import { TreeId, TreeNode } from '../types/tree-node';
import { flattenTree, FlattenedNode } from '../utils/tree-utils';

export interface FlattenedNodesCache<T> {
  nodesRef: Map<TreeId, TreeNode<T>> | null;
  expandedRef: Set<TreeId> | null;
  value: FlattenedNode[];
}

export function createFlattenedNodesCache<T>(): FlattenedNodesCache<T> {
  return {
    nodesRef: null,
    expandedRef: null,
    value: [],
  };
}

export function getFlattenedNodesCached<T>(
  nodes: Map<TreeId, TreeNode<T>>,
  expanded: Set<TreeId>,
  cache: FlattenedNodesCache<T>,
): FlattenedNode[] {
  if (cache.nodesRef === nodes && cache.expandedRef === expanded) {
    return cache.value;
  }

  cache.nodesRef = nodes;
  cache.expandedRef = expanded;
  cache.value = flattenTree(nodes, expanded);
  return cache.value;
}

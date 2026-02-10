import { getAncestorIds, getDescendantIds } from '../utils/tree-utils';
import { TreeId, TreeNode } from '../types/tree-node';

export function ancestorIdsFor<T>(
  nodeId: TreeId,
  nodes: Map<TreeId, TreeNode<T>>,
): TreeId[] {
  return getAncestorIds(nodeId, nodes);
}

export function descendantIdsFor<T>(
  nodeId: TreeId,
  nodes: Map<TreeId, TreeNode<T>>,
): TreeId[] {
  return getDescendantIds(nodeId, nodes);
}

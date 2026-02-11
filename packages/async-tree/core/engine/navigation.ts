import { TreeId, TreeNode } from '../types/tree-node';
import { ancestorIdsFor } from './node-index';

export function buildNavigationPath<T>(
  nodeId: TreeId,
  nodes: Map<TreeId, TreeNode<T>>,
): TreeId[] {
  const node = nodes.get(nodeId);
  if (!node) {
    return [];
  }

  return [...ancestorIdsFor(nodeId, nodes), nodeId];
}

export function ensurePathExpanded(
  expanded: Set<TreeId>,
  path: readonly TreeId[],
): Set<TreeId> {
  if (path.length <= 1) {
    return expanded;
  }

  const nextExpanded = new Set(expanded);
  for (let index = 0; index < path.length - 1; index += 1) {
    nextExpanded.add(path[index] as TreeId);
  }
  return nextExpanded;
}

export function findVisibleIndexById(
  rows: readonly { id: TreeId; visible: boolean }[],
  nodeId: TreeId,
): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && row.id === nodeId && row.visible) {
      return index;
    }
  }
  return -1;
}

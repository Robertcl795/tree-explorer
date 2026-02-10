import {
  FlattenedNode,
  getSelectionRange,
  toggleHierarchicalSelection,
} from '../utils/tree-utils';
import { SELECTION_MODES, SelectionMode } from '../types/tree-config';
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';

export function isSelectionAllowed<T>(
  selectionMode: SelectionMode,
  nodes: Map<TreeId, TreeNode<T>>,
  nodeId: TreeId,
): boolean {
  if (selectionMode.mode === SELECTION_MODES.NONE) {
    return false;
  }

  const node = nodes.get(nodeId);
  if (!node) {
    return false;
  }

  return !node.disabled && !node.placeholder;
}

export function toggleSimpleSelection(
  nodeId: TreeId,
  currentSelection: Set<TreeId>,
): Set<TreeId> {
  const nextSelection = new Set(currentSelection);
  if (nextSelection.has(nodeId)) {
    nextSelection.delete(nodeId);
  } else {
    nextSelection.add(nodeId);
  }
  return nextSelection;
}

export function selectToggle<T>(
  selectionMode: SelectionMode,
  nodes: Map<TreeId, TreeNode<T>>,
  currentSelection: Set<TreeId>,
  nodeId: TreeId,
): Set<TreeId> | null {
  if (!isSelectionAllowed(selectionMode, nodes, nodeId)) {
    return null;
  }

  if (selectionMode.mode === SELECTION_MODES.SINGLE) {
    return new Set([nodeId]);
  }

  if (selectionMode.mode === SELECTION_MODES.MULTI && selectionMode.hierarchical) {
    return toggleHierarchicalSelection(nodeId, nodes, currentSelection);
  }

  return toggleSimpleSelection(nodeId, currentSelection);
}

export function selectOne<T>(
  selectionMode: SelectionMode,
  nodes: Map<TreeId, TreeNode<T>>,
  nodeId: TreeId,
): Set<TreeId> | null {
  if (!isSelectionAllowed(selectionMode, nodes, nodeId)) {
    return null;
  }

  return new Set([nodeId]);
}

export function selectRangeFromRows<T>(
  fromId: TreeId,
  toId: TreeId,
  rows: TreeRowViewModel<T>[],
): TreeId[] {
  const startIndex = rows.findIndex((row) => row.id === fromId);
  const endIndex = rows.findIndex((row) => row.id === toId);

  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  const [fromIndex, toIndex] =
    startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

  return rows
    .slice(fromIndex, toIndex + 1)
    .filter((row) => !row.disabled && !row.placeholder)
    .map((row) => row.id);
}

export function selectRangeFromFlattened(
  fromId: TreeId,
  toId: TreeId,
  flattenedVisibleNodes: FlattenedNode[],
): TreeId[] {
  return getSelectionRange(fromId, toId, flattenedVisibleNodes);
}

export interface TreeUtilNode {
  id: string;
  parentId?: string | null;
  childrenIds?: readonly string[];
  level: number;
  disabled?: boolean;
}

export interface FlattenedNode extends TreeUtilNode {
  isVisible: boolean;
}

export interface SelectedState {
  selected: Set<string>;
  indeterminate: Set<string>;
}

export function flattenTree<T extends TreeUtilNode>(
  nodes: Map<string, T>,
  expandedIds: Set<string>,
  rootIds?: string[],
): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  const processed = new Set<string>();

  const roots =
    rootIds ||
    Array.from(nodes.values())
      .filter((node) => !node.parentId)
      .map((node) => node.id);

  function processNode(nodeId: string, isVisible: boolean): void {
    if (processed.has(nodeId)) {
      return;
    }
    processed.add(nodeId);

    const node = nodes.get(nodeId);
    if (!node) {
      return;
    }

    result.push({ ...node, isVisible });
    if (isVisible && expandedIds.has(nodeId) && node.childrenIds) {
      for (const childId of node.childrenIds) {
        processNode(childId, true);
      }
    }
  }

  roots.forEach((rootId) => processNode(rootId, true));

  return result;
}

export function getDescendantIds(
  nodeId: string,
  nodes: Map<string, TreeUtilNode>,
): string[] {
  const descendants: string[] = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    const node = nodes.get(currentId);

    if (node?.childrenIds) {
      for (const childId of node.childrenIds) {
        descendants.push(childId);
        queue.push(childId);
      }
    }
  }

  return descendants;
}

export function getAncestorIds(
  nodeId: string,
  nodes: Map<string, TreeUtilNode>,
): string[] {
  const ancestors: string[] = [];
  let current = nodes.get(nodeId);

  while (current?.parentId) {
    ancestors.unshift(current.parentId);
    current = nodes.get(current.parentId);
  }

  return ancestors;
}

export function getSelectionRange(
  startNodeId: string,
  endNodeId: string,
  flattenedNodes: FlattenedNode[],
): string[] {
  const startIndex = flattenedNodes.findIndex(
    (node) => node.id === startNodeId,
  );
  const endIndex = flattenedNodes.findIndex((node) => node.id === endNodeId);

  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  const [fromIndex, toIndex] =
    startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

  return flattenedNodes
    .slice(fromIndex, toIndex + 1)
    .filter((node) => !node.disabled)
    .map((node) => node.id);
}

export function calculateHierarchicalSelection(
  nodes: Map<string, TreeUtilNode>,
  selectedIds: Set<string>,
): SelectedState {
  const selected = new Set(selectedIds);
  const indeterminate = new Set<string>();

  function hasAnyUncheckedDescendant(nodeId: string): boolean {
    const descendants = getDescendantIds(nodeId, nodes);

    const enabledDescendants = descendants.filter((id) => {
      const node = nodes.get(id);
      return node && !node.disabled;
    });

    if (enabledDescendants.length === 0) {
      return !selected.has(nodeId);
    }

    return enabledDescendants.some((id) => !selected.has(id));
  }

  function areAllDescendantsChecked(nodeId: string): boolean {
    const descendants = getDescendantIds(nodeId, nodes);
    const enabledDescendants = descendants.filter((id) => {
      const node = nodes.get(id);
      return node && !node.disabled;
    });

    if (enabledDescendants.length === 0) {
      return selected.has(nodeId);
    }

    return enabledDescendants.every((id) => selected.has(id));
  }

  function checkLeafNode(nodeId: string): {
    selectedCount: number;
    totalCount: number;
  } {
    return { selectedCount: selected.has(nodeId) ? 1 : 0, totalCount: 1 };
  }

  function processChildren(children: string[]): {
    selectedCount: number;
    totalCount: number;
  } {
    let selectedCount = 0;
    let totalCount = 0;

    for (const childId of children) {
      const node = nodes.get(childId);
      if (node && !node.disabled) {
        const childResult = checkNode(childId);
        selectedCount += childResult.selectedCount;
        totalCount += childResult.totalCount;
      }
    }

    return { selectedCount, totalCount };
  }

  function updateParentSelectionState(
    nodeId: string,
    selectedCount: number,
    totalCount: number,
  ): { selectedCount: number; totalCount: number } {
    const hasUncheckedDescendants = hasAnyUncheckedDescendant(nodeId);
    const allDescendantsChecked = areAllDescendantsChecked(nodeId);

    if (selected.has(nodeId) && hasUncheckedDescendants) {
      indeterminate.add(nodeId);
      return { selectedCount: totalCount, totalCount };
    }

    if (selectedCount > 0 && selectedCount < totalCount) {
      indeterminate.add(nodeId);
      if (!selected.has(nodeId)) {
        return { selectedCount, totalCount };
      }
    } else if (
      selectedCount === totalCount &&
      totalCount > 0 &&
      allDescendantsChecked
    ) {
      selected.add(nodeId);
      indeterminate.delete(nodeId);
    } else if (selectedCount === 0 && !hasUncheckedDescendants) {
      selected.delete(nodeId);
      indeterminate.delete(nodeId);
    }

    return { selectedCount, totalCount };
  }

  function checkNode(nodeId: string): {
    selectedCount: number;
    totalCount: number;
  } {
    const node = nodes.get(nodeId);
    if (!node) {
      return { selectedCount: 0, totalCount: 0 };
    }

    if (!node.childrenIds || node.childrenIds.length === 0) {
      return checkLeafNode(nodeId);
    }

    const { selectedCount, totalCount } = processChildren(
      Array.from(node.childrenIds),
    );

    return updateParentSelectionState(nodeId, selectedCount, totalCount);
  }

  for (const nodeId of nodes.keys()) {
    checkNode(nodeId);
  }

  return { selected, indeterminate };
}

export function toggleHierarchicalSelection(
  nodeId: string,
  nodes: Map<string, TreeUtilNode>,
  selectedIds: Set<string>,
): Set<string> {
  const newSelected = new Set(selectedIds);
  const node = nodes.get(nodeId);
  if (!node) {
    return newSelected;
  }

  const descendants = getDescendantIds(nodeId, nodes);
  const shouldSelect = !newSelected.has(nodeId);

  if (shouldSelect) {
    newSelected.add(nodeId);
    descendants.forEach((id) => newSelected.add(id));
  } else {
    newSelected.delete(nodeId);
    descendants.forEach((id) => newSelected.delete(id));
  }

  return newSelected;
}

export function getMaxDepth(nodes: Map<string, TreeUtilNode>): number {
  let maxDepth = 0;
  for (const node of nodes.values()) {
    maxDepth = Math.max(maxDepth, node.level);
  }
  return maxDepth;
}


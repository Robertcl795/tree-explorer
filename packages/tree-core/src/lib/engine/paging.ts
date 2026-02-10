import { PageRequest, TreePaginationConfig } from '../types/tree-pagination';
import { TreeId, TreeNode } from '../types/tree-node';
import { TreePagedNodeDebugState, TreePagedNodeState, TreeState } from './types';
import { createPagedNodeState, placeholderId } from './utils';

export function setPaginationConfig(
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  config: TreePaginationConfig,
): boolean {
  if (!config.enabled) {
    return pagedChildren.delete(parentId);
  }

  const existing = pagedChildren.get(parentId);
  const pageIndexing = config.pageIndexing ?? 'zero-based';
  if (existing && existing.pageSize === config.pageSize && existing.pageIndexing === pageIndexing) {
    return false;
  }

  pagedChildren.set(
    parentId,
    createPagedNodeState(config.pageSize, pageIndexing, existing),
  );
  return true;
}

export function hasPagination(
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
): boolean {
  return pagedChildren.has(parentId);
}

export function getPagedNodeDebugState(
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
): TreePagedNodeDebugState | undefined {
  const state = pagedChildren.get(parentId);
  if (!state) {
    return undefined;
  }

  return {
    pageSize: state.pageSize,
    pageIndexing: state.pageIndexing,
    totalCount: state.totalCount,
    loadedPages: Array.from(state.loadedPages).sort((a, b) => a - b),
    inFlightPages: Array.from(state.inFlightPages).sort((a, b) => a - b),
    errorPages: Array.from(state.pageErrors.keys()).sort((a, b) => a - b),
  };
}

export function markPageInFlightState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  pageIndex: number,
): { nextState: TreeState<T>; marked: boolean } {
  const pagedState = pagedChildren.get(parentId);
  if (!pagedState) {
    return { nextState: state, marked: false };
  }

  if (pagedState.loadedPages.has(pageIndex) || pagedState.inFlightPages.has(pageIndex)) {
    return { nextState: state, marked: false };
  }

  pagedState.inFlightPages.add(pageIndex);
  const loading = new Set(state.loading);
  loading.add(parentId);

  return {
    nextState: {
      ...state,
      loading,
    },
    marked: true,
  };
}

export function ensureRangeLoadedPages<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  range: { start: number; end: number },
): { nextState: TreeState<T>; pagesToLoad: number[]; changed: boolean } {
  const pagedState = pagedChildren.get(parentId);
  if (!pagedState || pagedState.totalCount === null) {
    return { nextState: state, pagesToLoad: [], changed: false };
  }

  const maxIndex = Math.max(0, pagedState.totalCount - 1);
  const start = Math.max(0, Math.min(range.start, maxIndex));
  const end = Math.max(start, Math.min(range.end, maxIndex));

  const firstPage = Math.floor(start / pagedState.pageSize);
  const lastPage = Math.floor(end / pagedState.pageSize);

  let nextState = state;
  let changed = false;
  const pagesToLoad: number[] = [];

  for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
    const markResult = markPageInFlightState(
      nextState,
      pagedChildren,
      parentId,
      pageIndex,
    );
    nextState = markResult.nextState;
    if (markResult.marked) {
      pagesToLoad.push(pageIndex);
      changed = true;
    }
  }

  return { nextState, pagesToLoad, changed };
}

export function setChildrenLoadedState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  children: TreeNode<T>[],
  allNodes: TreeNode<T>[],
): TreeState<T> {
  const nodes = new Map(state.nodes);
  const loading = new Set(state.loading);

  const parent = nodes.get(parentId);
  if (parent) {
    nodes.set(parentId, {
      ...parent,
      childrenIds: children.map((child) => child.id),
      isLeaf: parent.isLeaf ?? children.length === 0,
    });
  }

  for (const child of allNodes) {
    nodes.set(child.id, child);
  }

  loading.delete(parentId);
  pagedChildren.delete(parentId);

  return {
    ...state,
    nodes,
    loading,
  };
}

function createPlaceholderNode<T>(
  parent: TreeNode<T>,
  index: number,
): TreeNode<T> {
  return {
    id: placeholderId(parent.id, index),
    parentId: parent.id,
    level: parent.level + 1,
    childrenIds: [],
    isLeaf: true,
    disabled: true,
    placeholder: true,
    placeholderIndex: index,
    data: undefined as unknown as T,
  };
}

function materializeChildrenSlots<T>(
  nodes: Map<TreeId, TreeNode<T>>,
  parent: TreeNode<T>,
  previousChildren: readonly TreeId[],
  totalCount: number,
): TreeId[] {
  const nextChildrenIds = new Array<TreeId>(totalCount);

  for (let index = 0; index < totalCount; index += 1) {
    const existingId = previousChildren[index];
    const existingNode = existingId ? nodes.get(existingId) : undefined;

    if (existingNode && existingNode.parentId === parent.id && !existingNode.placeholder) {
      nextChildrenIds[index] = existingId;
      continue;
    }

    const id = placeholderId(parent.id, index);
    nextChildrenIds[index] = id;

    if (!nodes.has(id)) {
      nodes.set(id, createPlaceholderNode(parent, index));
    }
  }

  return nextChildrenIds;
}

function clearRemovedPlaceholderNodes<T>(
  nodes: Map<TreeId, TreeNode<T>>,
  previousChildren: readonly TreeId[],
  nextLength: number,
): void {
  for (let index = nextLength; index < previousChildren.length; index += 1) {
    const removedId = previousChildren[index];
    if (!removedId) {
      continue;
    }

    const removedNode = nodes.get(removedId);
    if (removedNode?.placeholder) {
      nodes.delete(removedId);
    }
  }
}

export function primePagedPlaceholdersState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  totalCount: number,
): TreeState<T> {
  const parent = state.nodes.get(parentId);
  const pagedState = pagedChildren.get(parentId);
  if (!parent || !pagedState) {
    return state;
  }

  const safeTotalCount = Math.max(0, totalCount);
  const previousChildren = Array.isArray(parent.childrenIds) ? [...parent.childrenIds] : [];
  const nodes = new Map(state.nodes);

  if (previousChildren.length === safeTotalCount && pagedState.totalCount === safeTotalCount) {
    return state;
  }

  const nextChildrenIds = materializeChildrenSlots(
    nodes,
    parent,
    previousChildren,
    safeTotalCount,
  );
  clearRemovedPlaceholderNodes(nodes, previousChildren, safeTotalCount);

  nodes.set(parentId, {
    ...parent,
    childrenIds: nextChildrenIds,
    isLeaf: safeTotalCount === 0,
  });

  pagedState.totalCount = safeTotalCount;

  return {
    ...state,
    nodes,
  };
}

export function applyPagedChildrenState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  request: PageRequest,
  children: TreeNode<T>[],
  totalCount: number,
  allNodes: TreeNode<T>[],
): TreeState<T> {
  const parent = state.nodes.get(parentId);
  const pagedState = pagedChildren.get(parentId);
  if (!parent || !pagedState) {
    return state;
  }

  const nodes = new Map(state.nodes);
  const loading = new Set(state.loading);
  const errors = new Map(state.errors);

  const safeTotalCount = Math.max(0, totalCount);
  const previousChildren = Array.isArray(parent.childrenIds) ? [...parent.childrenIds] : [];
  const shouldMaterializeAllSlots = previousChildren.length !== safeTotalCount;

  const nextChildrenIds = shouldMaterializeAllSlots
    ? materializeChildrenSlots(nodes, parent, previousChildren, safeTotalCount)
    : [...previousChildren];

  clearRemovedPlaceholderNodes(nodes, previousChildren, safeTotalCount);

  const startOffset = request.pageIndex * pagedState.pageSize;
  for (const child of allNodes) {
    nodes.set(child.id, child);
  }

  for (let itemIndex = 0; itemIndex < children.length; itemIndex += 1) {
    const absoluteIndex = startOffset + itemIndex;
    if (absoluteIndex < 0 || absoluteIndex >= safeTotalCount) {
      continue;
    }

    const child = children[itemIndex];
    const previousId = nextChildrenIds[absoluteIndex];
    nextChildrenIds[absoluteIndex] = child.id;

    if (previousId && previousId !== child.id) {
      const previousNode = nodes.get(previousId);
      if (previousNode?.placeholder) {
        nodes.delete(previousId);
      }
    }
  }

  nodes.set(parentId, {
    ...parent,
    childrenIds: nextChildrenIds,
    isLeaf: safeTotalCount === 0,
  });

  pagedState.totalCount = safeTotalCount;
  pagedState.loadedPages.add(request.pageIndex);
  pagedState.inFlightPages.delete(request.pageIndex);
  pagedState.pageErrors.delete(request.pageIndex);

  if (pagedState.pageErrors.size === 0) {
    errors.delete(parentId);
  } else if (!errors.has(parentId)) {
    const firstError = pagedState.pageErrors.values().next().value;
    if (firstError !== undefined) {
      errors.set(parentId, firstError);
    }
  }

  if (pagedState.inFlightPages.size === 0) {
    loading.delete(parentId);
  } else {
    loading.add(parentId);
  }

  return {
    ...state,
    nodes,
    loading,
    errors,
  };
}

export function clearPageInFlightState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  pageIndex: number,
): TreeState<T> {
  const pagedState = pagedChildren.get(parentId);
  if (!pagedState) {
    return state;
  }

  pagedState.inFlightPages.delete(pageIndex);

  const loading = new Set(state.loading);
  if (pagedState.inFlightPages.size === 0) {
    loading.delete(parentId);
  } else {
    loading.add(parentId);
  }

  return {
    ...state,
    loading,
  };
}

export function setPageErrorState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  pageIndex: number,
  error: unknown,
): TreeState<T> {
  const pagedState = pagedChildren.get(parentId);
  if (!pagedState) {
    return state;
  }

  pagedState.pageErrors.set(pageIndex, error);
  pagedState.inFlightPages.delete(pageIndex);

  const loading = new Set(state.loading);
  const errors = new Map(state.errors);
  errors.set(parentId, error);

  if (pagedState.inFlightPages.size === 0) {
    loading.delete(parentId);
  }

  return {
    ...state,
    loading,
    errors,
  };
}

export function clearPageErrorState<T>(
  state: TreeState<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  parentId: TreeId,
  pageIndex: number,
): TreeState<T> {
  const pagedState = pagedChildren.get(parentId);
  if (!pagedState || !pagedState.pageErrors.has(pageIndex)) {
    return state;
  }

  pagedState.pageErrors.delete(pageIndex);

  if (pagedState.pageErrors.size > 0 || !state.errors.has(parentId)) {
    return state;
  }

  const errors = new Map(state.errors);
  errors.delete(parentId);
  return {
    ...state,
    errors,
  };
}

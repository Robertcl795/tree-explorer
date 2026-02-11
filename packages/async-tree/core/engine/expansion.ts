import { TreeId, TreeNode } from '../types/tree-node';
import { ancestorIdsFor } from './node-index';
import { TreeState } from './types';

export interface ToggleExpandResult<T> {
  nextState: TreeState<T>;
  shouldLoadChildren: boolean;
}

export function toggleExpandState<T>(
  state: TreeState<T>,
  nodeId: TreeId,
  canLoadChildren: boolean,
): ToggleExpandResult<T> {
  const node = state.nodes.get(nodeId);
  if (!node || node.isLeaf || node.placeholder) {
    return {
      nextState: state,
      shouldLoadChildren: false,
    };
  }

  let shouldLoadChildren = false;

  const expanded = new Set(state.expanded);
  const loading = new Set(state.loading);

  if (expanded.has(nodeId)) {
    expanded.delete(nodeId);
    loading.delete(nodeId);
  } else {
    expanded.add(nodeId);

    if (node.childrenIds === undefined && canLoadChildren && !loading.has(nodeId)) {
      loading.add(nodeId);
      shouldLoadChildren = true;
    }
  }

  return {
    nextState: {
      ...state,
      expanded,
      loading,
    },
    shouldLoadChildren,
  };
}

export function expandAncestorPath<T>(
  state: TreeState<T>,
  nodeId: TreeId,
): TreeState<T> {
  const ancestors = ancestorIdsFor(nodeId, state.nodes);
  if (ancestors.length === 0) {
    return state;
  }

  const expanded = new Set(state.expanded);
  for (const id of ancestors) {
    expanded.add(id);
  }

  return {
    ...state,
    expanded,
  };
}

export function clearChildrenState<T>(
  state: TreeState<T>,
  parent: TreeNode<T>,
  descendants: TreeId[],
): TreeState<T> {
  const nodes = new Map(state.nodes);
  for (const id of descendants) {
    nodes.delete(id);
  }

  nodes.set(parent.id, {
    ...parent,
    childrenIds: [],
    isLeaf: false,
  });

  const expanded = new Set(state.expanded);
  const selected = new Set(state.selected);
  const loading = new Set(state.loading);
  const errors = new Map(state.errors);

  for (const id of descendants) {
    expanded.delete(id);
    selected.delete(id);
    loading.delete(id);
    errors.delete(id);
  }

  expanded.delete(parent.id);
  loading.delete(parent.id);

  return {
    ...state,
    nodes,
    expanded,
    selected,
    loading,
    errors,
  };
}

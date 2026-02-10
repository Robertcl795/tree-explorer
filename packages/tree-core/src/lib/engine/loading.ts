import { TreeId } from '../types/tree-node';
import { TreeState } from './types';

export function clearLoadingState<T>(
  state: TreeState<T>,
  nodeId: TreeId,
): TreeState<T> {
  if (!state.loading.has(nodeId)) {
    return state;
  }

  const loading = new Set(state.loading);
  loading.delete(nodeId);
  return {
    ...state,
    loading,
  };
}

export function setNodeErrorState<T>(
  state: TreeState<T>,
  nodeId: TreeId,
  error: unknown,
): TreeState<T> {
  const errors = new Map(state.errors);
  errors.set(nodeId, error);
  return {
    ...state,
    errors,
  };
}

export function clearNodeErrorState<T>(
  state: TreeState<T>,
  nodeId: TreeId,
): TreeState<T> {
  if (!state.errors.has(nodeId)) {
    return state;
  }

  const errors = new Map(state.errors);
  errors.delete(nodeId);
  return {
    ...state,
    errors,
  };
}

import { DEFAULT_TREE_FILTERING_CONFIG, TreeFilteringConfig } from '../types/tree-filter';
import { TreeId, TreeNode } from '../types/tree-node';
import { TreePagedNodeState, TreeState } from './types';

export function createInitialTreeState<T>(): TreeState<T> {
  return {
    nodes: new Map(),
    expanded: new Set(),
    selected: new Set(),
    loading: new Set(),
    errors: new Map(),
  };
}

export function createTreeStateFromNodes<T>(
  nodesInput: TreeNode<T>[],
): TreeState<T> {
  const nodes = new Map<TreeId, TreeNode<T>>();
  for (const node of nodesInput) {
    nodes.set(node.id, node);
  }

  return {
    nodes,
    expanded: new Set(),
    selected: new Set(),
    loading: new Set(),
    errors: new Map(),
  };
}

export function createPagedNodeState(
  pageSize: number,
  pageIndexing: 'zero-based' | 'one-based',
  existing?: TreePagedNodeState,
): TreePagedNodeState {
  return {
    pageSize,
    pageIndexing,
    totalCount: existing?.totalCount ?? null,
    loadedPages: existing?.loadedPages ?? new Set<number>(),
    inFlightPages: existing?.inFlightPages ?? new Set<number>(),
    pageErrors: existing?.pageErrors ?? new Map<number, unknown>(),
  };
}

export function placeholderId(parentId: TreeId, index: number): TreeId {
  return `__tree_placeholder__${parentId}__${index}`;
}

export function fingerprintFilterConfig(
  config: Required<TreeFilteringConfig>,
): string {
  return JSON.stringify({
    mode: config.mode,
    showParentsOfMatches: config.showParentsOfMatches,
    autoExpandMatches: config.autoExpandMatches,
    selectionPolicy: config.selectionPolicy,
    keepPlaceholdersVisible: config.keepPlaceholdersVisible,
  });
}

export function mergeFilteringConfig(
  config: TreeFilteringConfig | undefined,
): Required<TreeFilteringConfig> {
  return {
    ...DEFAULT_TREE_FILTERING_CONFIG,
    ...config,
  };
}

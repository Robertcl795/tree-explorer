import { TreeAdapter } from '../types/tree-adapter';
import {
  TreeFilterInput,
  TreeFilterMode,
  TreeFilterQuery,
  TreeFilteringConfig,
} from '../types/tree-filter';
import { TreeConfig } from '../types/tree-config';
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';
import {
  calculateHierarchicalSelection,
  FlattenedNode,
} from '../utils/tree-utils';
import { ancestorIdsFor } from './node-index';
import {
  FilteredVisibilityState,
  TreeEngineProjection,
  TreePagedNodeState,
  TreeState,
} from './types';

export function cloneFilterQuery(
  query: TreeFilterQuery | null,
): TreeFilterQuery | null {
  if (!query) {
    return null;
  }

  return {
    ...query,
    tokens: query.tokens ? [...query.tokens] : undefined,
    fields: query.fields ? [...query.fields] : undefined,
    flags: query.flags ? { ...query.flags } : undefined,
  };
}

export function normalizeFilterQuery(
  input: TreeFilterInput,
): TreeFilterQuery | null {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) {
      return null;
    }
    return { text, mode: 'contains' };
  }

  if (!input || typeof input !== 'object') {
    return null;
  }

  const text = typeof input.text === 'string' ? input.text.trim() : undefined;
  const tokens = (input.tokens ?? [])
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const fields = (input.fields ?? [])
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
  const hasFlags = !!input.flags && Object.keys(input.flags).length > 0;
  const hasTerms = !!text || tokens.length > 0;
  const hasContext = fields.length > 0 || hasFlags;

  if (!hasTerms && !hasContext) {
    return null;
  }

  return {
    text,
    tokens: tokens.length > 0 ? tokens : undefined,
    fields: fields.length > 0 ? fields : undefined,
    flags: input.flags ? { ...input.flags } : undefined,
    caseSensitive: input.caseSensitive,
    mode: input.mode ?? 'contains',
  };
}

export function filterFingerprint(query: TreeFilterQuery | null): string {
  if (!query) {
    return '';
  }
  return JSON.stringify(query);
}

export function shouldApplyClientFiltering(config: Required<TreeFilteringConfig>): boolean {
  const mode: TreeFilterMode = config.mode;
  return mode !== 'server';
}

function isLegacyVisible<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  data: T,
): boolean {
  return adapter.isVisible ? adapter.isVisible(data) : true;
}

function queryTerms(query: TreeFilterQuery): string[] {
  const terms: string[] = [];

  if (typeof query.text === 'string') {
    const trimmed = query.text.trim();
    if (trimmed.length > 0) {
      if (query.mode === 'exact') {
        terms.push(trimmed);
      } else {
        terms.push(...trimmed.split(/\s+/));
      }
    }
  }

  for (const token of query.tokens ?? []) {
    const trimmed = token.trim();
    if (trimmed.length > 0) {
      terms.push(trimmed);
    }
  }

  return terms;
}

function matchesActiveFilter<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  data: T,
  label: string,
  query: TreeFilterQuery,
): boolean {
  if (adapter.matches) {
    return adapter.matches(data, query);
  }

  const searchText = adapter.getSearchText
    ? adapter.getSearchText(data)
    : label;
  const sourceText = typeof searchText === 'string' ? searchText : '';
  const terms = queryTerms(query);

  if (terms.length === 0) {
    return true;
  }

  const caseSensitive = query.caseSensitive === true;
  const normalizedSource = caseSensitive
    ? sourceText
    : sourceText.toLocaleLowerCase();
  const normalizedTerms = caseSensitive
    ? terms
    : terms.map((term) => term.toLocaleLowerCase());

  if (query.mode === 'exact') {
    return normalizedTerms.every((term) => normalizedSource === term);
  }

  return normalizedTerms.every((term) => normalizedSource.includes(term));
}

export function resolveHighlightRanges<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  label: string,
  query: TreeFilterQuery,
) {
  if (adapter.highlightRanges) {
    return adapter.highlightRanges(label, query);
  }

  const text = query.text?.trim();
  if (!text) {
    return undefined;
  }

  const caseSensitive = query.caseSensitive === true;
  const source = caseSensitive ? label : label.toLocaleLowerCase();
  const needle = caseSensitive ? text : text.toLocaleLowerCase();

  if (query.mode === 'exact') {
    return source === needle && label.length > 0
      ? [{ start: 0, end: label.length }]
      : undefined;
  }

  const start = source.indexOf(needle);
  if (start < 0) {
    return undefined;
  }

  return [{ start, end: start + needle.length }];
}

export function resolveIsLeaf<TSource, T>(
  adapter: TreeAdapter<TSource, T>,
  node: TreeNode<T>,
): boolean {
  if (node.placeholder) {
    return true;
  }

  const adapterResult = adapter.isLeaf?.(node.data, {
    node,
    parentId: node.parentId ?? null,
    level: node.level,
  });
  if (typeof adapterResult === 'boolean') {
    return adapterResult;
  }

  if (typeof node.isLeaf === 'boolean') {
    return node.isLeaf;
  }

  if (Array.isArray(node.childrenIds)) {
    return node.childrenIds.length === 0;
  }

  if (adapter.hasChildren) {
    const hasChildren = adapter.hasChildren(node.data);
    if (typeof hasChildren === 'boolean') {
      return !hasChildren;
    }
  }

  if (adapter.loadChildren) {
    return false;
  }

  return true;
}

export function computeFilteredVisibility<TSource, T>(
  state: TreeState<T>,
  adapter: TreeAdapter<TSource, T>,
  flattened: FlattenedNode[],
  filterQuery: TreeFilterQuery | null,
  filterConfig: Required<TreeFilteringConfig>,
): FilteredVisibilityState {
  const activeQuery = filterQuery;
  const hasQuery = !!activeQuery;
  const applyClientFiltering = shouldApplyClientFiltering(filterConfig);
  const flattenedIds = new Set<TreeId>(flattened.map((node) => node.id));
  const baseVisibleIds = new Set<TreeId>();
  const directMatchIds = new Set<TreeId>();

  for (const flatNode of flattened) {
    const node = state.nodes.get(flatNode.id);
    if (!node || node.placeholder) {
      continue;
    }

    const data = node.data;
    if (!isLegacyVisible(adapter, data)) {
      continue;
    }

    const label = adapter.getLabel(data);
    baseVisibleIds.add(node.id);

    if (
      !hasQuery ||
      !applyClientFiltering ||
      (activeQuery && matchesActiveFilter(adapter, data, label, activeQuery))
    ) {
      directMatchIds.add(node.id);
    }
  }

  const visibleIds = new Set<TreeId>();
  const visibleContentIds = hasQuery
    ? new Set(directMatchIds)
    : new Set(baseVisibleIds);

  if (hasQuery && filterConfig.showParentsOfMatches) {
    for (const matchId of directMatchIds) {
      const ancestors = ancestorIdsFor(matchId, state.nodes);
      for (const ancestorId of ancestors) {
        if (flattenedIds.has(ancestorId) && baseVisibleIds.has(ancestorId)) {
          visibleContentIds.add(ancestorId);
        }
      }
    }
  }

  for (const nodeId of visibleContentIds) {
    visibleIds.add(nodeId);
  }

  for (const flatNode of flattened) {
    const node = state.nodes.get(flatNode.id);
    if (!node?.placeholder) {
      continue;
    }

    if (hasQuery && !filterConfig.keepPlaceholdersVisible) {
      continue;
    }

    if (!node.parentId || !hasQuery || visibleContentIds.has(node.parentId)) {
      visibleIds.add(node.id);
    }
  }

  return { visibleIds, directMatchIds };
}

function createPlaceholderRow<T>(
  node: TreeNode<T>,
  pagedChildren: Map<TreeId, TreePagedNodeState>,
  visible: boolean,
): TreeRowViewModel<T> {
  const parentId = node.parentId ?? null;
  const placeholderIndex = typeof node.placeholderIndex === 'number' ? node.placeholderIndex : 0;
  const pagedState = parentId ? pagedChildren.get(parentId) : undefined;

  const pageIndex = pagedState
    ? Math.floor(placeholderIndex / pagedState.pageSize)
    : null;
  const loading = pageIndex !== null && !!pagedState?.inFlightPages.has(pageIndex);
  const error = pageIndex !== null && !!pagedState?.pageErrors.has(pageIndex);
  const label = error
    ? 'Failed to load page'
    : loading
      ? 'Loading...'
      : 'Not loaded';

  return {
    id: node.id,
    parentId,
    level: node.level,
    label,
    icon: null,
    isLeaf: true,
    disabled: true,
    visible,
    expanded: false,
    selected: false,
    indeterminate: false,
    loading,
    error,
    childrenIds: [],
    data: node.data,
    placeholder: true,
    placeholderIndex,
  };
}

export interface BuildProjectionInput<TSource, T> {
  state: TreeState<T>;
  pagedChildren: Map<TreeId, TreePagedNodeState>;
  adapter: TreeAdapter<TSource, T>;
  config?: TreeConfig<T>;
  flattened: FlattenedNode[];
  filterQuery: TreeFilterQuery | null;
  filterConfig: Required<TreeFilteringConfig>;
}

export function buildProjection<TSource, T>(
  input: BuildProjectionInput<TSource, T>,
): TreeEngineProjection<T> {
  const {
    state,
    pagedChildren,
    adapter,
    config,
    flattened,
    filterQuery,
    filterConfig,
  } = input;
  const selectionData = calculateHierarchicalSelection(state.nodes, state.selected);
  const visibilityState = computeFilteredVisibility(
    state,
    adapter,
    flattened,
    filterQuery,
    filterConfig,
  );

  const rowsById = new Map<TreeId, TreeRowViewModel<T>>();
  const orderedIds: TreeId[] = [];
  const activeQuery = filterQuery;

  for (const flatNode of flattened) {
    const node = state.nodes.get(flatNode.id);
    if (!node) {
      continue;
    }

    const visible = visibilityState.visibleIds.has(node.id);
    let row: TreeRowViewModel<T>;

    if (node.placeholder) {
      row = createPlaceholderRow(node, pagedChildren, visible);
    } else {
      const data = node.data;
      const label = adapter.getLabel(data);
      const disabled = adapter.isDisabled ? adapter.isDisabled(data) : !!node.disabled;
      const adapterIcon = adapter.getIcon ? adapter.getIcon(data) : undefined;
      const icon = adapterIcon ?? config?.defaultIcon;
      const isLeaf = resolveIsLeaf(adapter, node);
      const highlightRanges =
        activeQuery &&
        shouldApplyClientFiltering(filterConfig) &&
        visibilityState.directMatchIds.has(node.id)
          ? resolveHighlightRanges(adapter, label, activeQuery)
          : undefined;

      row = {
        id: node.id,
        parentId: node.parentId,
        level: node.level,
        label,
        icon: icon ?? null,
        isLeaf,
        disabled,
        visible,
        expanded: state.expanded.has(node.id),
        selected: selectionData.selected.has(node.id),
        indeterminate: selectionData.indeterminate.has(node.id),
        loading: state.loading.has(node.id),
        error: state.errors.has(node.id),
        highlightRanges,
        childrenIds: node.childrenIds,
        data: node.data,
        placeholder: false,
      };
    }

    rowsById.set(row.id, row);
    orderedIds.push(row.id);
  }

  return {
    orderedIds,
    rowsById,
    visibleIds: visibilityState.visibleIds,
  };
}

export function projectionToVisibleRows<T>(
  projection: TreeEngineProjection<T>,
): TreeRowViewModel<T>[] {
  const rows: TreeRowViewModel<T>[] = [];

  for (const id of projection.orderedIds) {
    if (!projection.visibleIds.has(id)) {
      continue;
    }
    const row = projection.rowsById.get(id);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

export function projectionRowsByIds<T>(
  projection: TreeEngineProjection<T>,
  ids: TreeId[],
): TreeRowViewModel<T>[] {
  const rows: TreeRowViewModel<T>[] = [];

  for (const id of ids) {
    const row = projection.rowsById.get(id);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

export function collectMatchAncestorIds<TSource, T>(
  state: TreeState<T>,
  adapter: TreeAdapter<TSource, T>,
  filterQuery: TreeFilterQuery | null,
): Set<TreeId> {
  if (!filterQuery) {
    return new Set<TreeId>();
  }

  const ancestorsToExpand = new Set<TreeId>();
  for (const node of state.nodes.values()) {
    if (node.placeholder) {
      continue;
    }

    const data = node.data;
    if (!isLegacyVisible(adapter, data)) {
      continue;
    }

    const label = adapter.getLabel(data);
    if (!matchesActiveFilter(adapter, data, label, filterQuery)) {
      continue;
    }

    const ancestors = ancestorIdsFor(node.id, state.nodes);
    for (const ancestorId of ancestors) {
      ancestorsToExpand.add(ancestorId);
    }
  }

  return ancestorsToExpand;
}

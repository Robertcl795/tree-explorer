import {
  calculateHierarchicalSelection,
  flattenTree,
  getAncestorIds,
  getDescendantIds,
  getMaxDepth,
  getSelectionRange,
  toggleHierarchicalSelection,
} from '../utils/tree-utils';
import {
  SELECTION_MODES,
  SelectionMode,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '../types/tree-config';
import { TreeAdapter } from '../types/tree-adapter';
import {
  DEFAULT_TREE_FILTERING_CONFIG,
  TreeFilterInput,
  TreeFilteringConfig,
  TreeFilterMode,
  TreeFilterQuery,
} from '../types/tree-filter';
import { PageRequest, TreePaginationConfig } from '../types/tree-pagination';
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';

interface TreeState<T> {
  nodes: Map<TreeId, TreeNode<T>>;
  expanded: Set<TreeId>;
  selected: Set<TreeId>;
  loading: Set<TreeId>;
  errors: Map<TreeId, unknown>;
}

interface TreePagedNodeState {
  pageSize: number;
  pageIndexing: 'zero-based' | 'one-based';
  totalCount: number | null;
  loadedPages: Set<number>;
  inFlightPages: Set<number>;
  pageErrors: Map<number, unknown>;
}

export interface TreePagedNodeDebugState {
  pageSize: number;
  pageIndexing: 'zero-based' | 'one-based';
  totalCount: number | null;
  loadedPages: number[];
  inFlightPages: number[];
  errorPages: number[];
}

export interface TreeStats {
  total: number;
  visible: number;
  expanded: number;
  selected: number;
  loading: number;
  maxDepth: number;
}

interface FilteredVisibilityState {
  visibleIds: Set<TreeId>;
  directMatchIds: Set<TreeId>;
}

export class TreeEngine<T> {
  private state: TreeState<T> = {
    nodes: new Map(),
    expanded: new Set(),
    selected: new Set(),
    loading: new Set(),
    errors: new Map(),
  };

  private readonly pagedChildren = new Map<TreeId, TreePagedNodeState>();

  private selectionMode: SelectionMode = { mode: SELECTION_MODES.NONE };
  private virtualizationMode = VIRTUALIZATION_MODES.AUTO;
  private filterQuery: TreeFilterQuery | null = null;
  private filterConfig: Required<TreeFilteringConfig> = {
    ...DEFAULT_TREE_FILTERING_CONFIG,
  };

  configure(config?: Partial<TreeConfig<T>>): void {
    if (config?.selection) {
      this.selectionMode = config.selection;
    }
    if (config?.virtualization?.mode) {
      this.virtualizationMode = config.virtualization.mode;
    }
    if (config?.filtering) {
      this.filterConfig = {
        ...DEFAULT_TREE_FILTERING_CONFIG,
        ...config.filtering,
      };
    }
  }

  get nodes(): Map<TreeId, TreeNode<T>> {
    return this.state.nodes;
  }

  get expandedIds(): Set<TreeId> {
    return this.state.expanded;
  }

  get selectedIds(): Set<TreeId> {
    return this.state.selected;
  }

  get loadingIds(): Set<TreeId> {
    return this.state.loading;
  }

  get stats(): TreeStats {
    return {
      total: this.state.nodes.size,
      visible: this.flattenedNodes().filter((node) => node.isVisible).length,
      expanded: this.state.expanded.size,
      selected: this.state.selected.size,
      loading: this.state.loading.size,
      maxDepth: getMaxDepth(this.state.nodes),
    };
  }

  getFilterQuery(): TreeFilterQuery | null {
    if (!this.filterQuery) {
      return null;
    }

    return {
      ...this.filterQuery,
      tokens: this.filterQuery.tokens ? [...this.filterQuery.tokens] : undefined,
      fields: this.filterQuery.fields ? [...this.filterQuery.fields] : undefined,
      flags: this.filterQuery.flags ? { ...this.filterQuery.flags } : undefined,
    };
  }

  init(nodesInput: TreeNode<T>[]): void {
    const nodes = new Map<TreeId, TreeNode<T>>();
    nodesInput.forEach((node) => nodes.set(node.id, node));

    this.state = {
      nodes,
      expanded: new Set(),
      selected: new Set(),
      loading: new Set(),
      errors: new Map(),
    };
    this.pagedChildren.clear();
  }

  getNode(id: TreeId): TreeNode<T> | undefined {
    return this.state.nodes.get(id);
  }

  setPagination(parentId: TreeId, config: TreePaginationConfig): void {
    if (!config.enabled) {
      this.pagedChildren.delete(parentId);
      return;
    }

    const existing = this.pagedChildren.get(parentId);
    const pageIndexing = config.pageIndexing ?? 'zero-based';
    if (existing && existing.pageSize === config.pageSize && existing.pageIndexing === pageIndexing) {
      return;
    }

    this.pagedChildren.set(parentId, {
      pageSize: config.pageSize,
      pageIndexing,
      totalCount: existing?.totalCount ?? null,
      loadedPages: existing?.loadedPages ?? new Set<number>(),
      inFlightPages: existing?.inFlightPages ?? new Set<number>(),
      pageErrors: existing?.pageErrors ?? new Map<number, unknown>(),
    });
  }

  hasPagination(parentId: TreeId): boolean {
    return this.pagedChildren.has(parentId);
  }

  getPagedNodeDebugState(parentId: TreeId): TreePagedNodeDebugState | undefined {
    const state = this.pagedChildren.get(parentId);
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

  toggleExpand(nodeId: TreeId, canLoadChildren: boolean): boolean {
    const node = this.getNode(nodeId);
    if (!node || node.isLeaf || node.placeholder) {
      return false;
    }

    let shouldLoadChildren = false;

    const expanded = new Set(this.state.expanded);
    const loading = new Set(this.state.loading);

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

    this.state = {
      ...this.state,
      expanded,
      loading,
    };

    return shouldLoadChildren;
  }

  markPageInFlight(parentId: TreeId, pageIndex: number): boolean {
    const pagedState = this.pagedChildren.get(parentId);
    if (!pagedState) {
      return false;
    }

    if (pagedState.loadedPages.has(pageIndex) || pagedState.inFlightPages.has(pageIndex)) {
      return false;
    }

    pagedState.inFlightPages.add(pageIndex);

    const loading = new Set(this.state.loading);
    loading.add(parentId);
    this.state = {
      ...this.state,
      loading,
    };

    return true;
  }

  ensureRangeLoaded(
    parentId: TreeId,
    range: { start: number; end: number },
  ): number[] {
    const pagedState = this.pagedChildren.get(parentId);
    if (!pagedState || pagedState.totalCount === null) {
      return [];
    }

    const maxIndex = Math.max(0, pagedState.totalCount - 1);
    const start = Math.max(0, Math.min(range.start, maxIndex));
    const end = Math.max(start, Math.min(range.end, maxIndex));

    const firstPage = Math.floor(start / pagedState.pageSize);
    const lastPage = Math.floor(end / pagedState.pageSize);

    const pagesToLoad: number[] = [];
    for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
      if (this.markPageInFlight(parentId, pageIndex)) {
        pagesToLoad.push(pageIndex);
      }
    }

    return pagesToLoad;
  }

  setChildrenLoaded(
    parentId: TreeId,
    children: TreeNode<T>[],
    allNodes: TreeNode<T>[] = children,
  ): void {
    const nodes = new Map(this.state.nodes);
    const loading = new Set(this.state.loading);

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
    this.pagedChildren.delete(parentId);

    this.state = {
      ...this.state,
      nodes,
      loading,
    };
  }

  applyPagedChildren(
    parentId: TreeId,
    request: PageRequest,
    children: TreeNode<T>[],
    totalCount: number,
    allNodes: TreeNode<T>[] = children,
  ): void {
    const parent = this.state.nodes.get(parentId);
    const pagedState = this.pagedChildren.get(parentId);
    if (!parent || !pagedState) {
      return;
    }

    const nodes = new Map(this.state.nodes);
    const loading = new Set(this.state.loading);
    const errors = new Map(this.state.errors);

    const safeTotalCount = Math.max(0, totalCount);
    const previousChildren = Array.isArray(parent.childrenIds) ? [...parent.childrenIds] : [];
    const nextChildrenIds = new Array<TreeId>(safeTotalCount);

    for (let index = 0; index < safeTotalCount; index += 1) {
      const existingId = previousChildren[index];
      const existingNode = existingId ? nodes.get(existingId) : undefined;

      if (existingNode && !existingNode.placeholder && existingNode.parentId === parentId) {
        nextChildrenIds[index] = existingId;
        continue;
      }

      const placeholderId = this.placeholderId(parentId, index);
      nextChildrenIds[index] = placeholderId;

      if (!nodes.has(placeholderId)) {
        nodes.set(placeholderId, {
          id: placeholderId,
          parentId,
          level: parent.level + 1,
          childrenIds: [],
          isLeaf: true,
          disabled: true,
          placeholder: true,
          placeholderIndex: index,
          data: undefined as unknown as T,
        });
      }
    }

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

    for (let index = safeTotalCount; index < previousChildren.length; index += 1) {
      const removedId = previousChildren[index];
      if (!removedId) {
        continue;
      }
      const removedNode = nodes.get(removedId);
      if (removedNode?.placeholder) {
        nodes.delete(removedId);
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
    }

    if (pagedState.inFlightPages.size === 0) {
      loading.delete(parentId);
    } else {
      loading.add(parentId);
    }

    this.state = {
      ...this.state,
      nodes,
      loading,
      errors,
    };
  }

  clearPageInFlight(parentId: TreeId, pageIndex: number): void {
    const pagedState = this.pagedChildren.get(parentId);
    if (!pagedState) {
      return;
    }

    pagedState.inFlightPages.delete(pageIndex);

    const loading = new Set(this.state.loading);
    if (pagedState.inFlightPages.size === 0) {
      loading.delete(parentId);
    } else {
      loading.add(parentId);
    }

    this.state = {
      ...this.state,
      loading,
    };
  }

  setPageError(parentId: TreeId, pageIndex: number, error: unknown): void {
    const pagedState = this.pagedChildren.get(parentId);
    if (!pagedState) {
      return;
    }

    pagedState.pageErrors.set(pageIndex, error);
    pagedState.inFlightPages.delete(pageIndex);

    const loading = new Set(this.state.loading);
    const errors = new Map(this.state.errors);
    errors.set(parentId, error);

    if (pagedState.inFlightPages.size === 0) {
      loading.delete(parentId);
    }

    this.state = {
      ...this.state,
      loading,
      errors,
    };
  }

  clearPageError(parentId: TreeId, pageIndex: number): void {
    const pagedState = this.pagedChildren.get(parentId);
    if (!pagedState || !pagedState.pageErrors.has(pageIndex)) {
      return;
    }

    pagedState.pageErrors.delete(pageIndex);

    if (pagedState.pageErrors.size === 0 && this.state.errors.has(parentId)) {
      const errors = new Map(this.state.errors);
      errors.delete(parentId);
      this.state = {
        ...this.state,
        errors,
      };
    }
  }

  clearLoading(nodeId: TreeId): void {
    if (!this.state.loading.has(nodeId)) {
      return;
    }
    const loading = new Set(this.state.loading);
    loading.delete(nodeId);
    this.state = {
      ...this.state,
      loading,
    };
  }

  setNodeError(nodeId: TreeId, error: unknown): void {
    const errors = new Map(this.state.errors);
    errors.set(nodeId, error);
    this.state = {
      ...this.state,
      errors,
    };
  }

  clearNodeError(nodeId: TreeId): void {
    if (!this.state.errors.has(nodeId)) {
      return;
    }
    const errors = new Map(this.state.errors);
    errors.delete(nodeId);
    this.state = {
      ...this.state,
      errors,
    };
  }

  clearChildren(parentId: TreeId): void {
    const parent = this.state.nodes.get(parentId);
    if (!parent) {
      return;
    }

    const descendants = getDescendantIds(parentId, this.state.nodes);
    const nodes = new Map(this.state.nodes);
    descendants.forEach((id) => nodes.delete(id));

    nodes.set(parentId, {
      ...parent,
      childrenIds: [],
      isLeaf: false,
    });

    const expanded = new Set(this.state.expanded);
    const selected = new Set(this.state.selected);
    const loading = new Set(this.state.loading);
    const errors = new Map(this.state.errors);

    descendants.forEach((id) => {
      expanded.delete(id);
      selected.delete(id);
      loading.delete(id);
      errors.delete(id);
    });

    expanded.delete(parentId);
    loading.delete(parentId);

    this.pagedChildren.delete(parentId);

    this.state = {
      ...this.state,
      nodes,
      expanded,
      selected,
      loading,
      errors,
    };
  }

  expandPath(nodeId: TreeId): void {
    const ancestors = getAncestorIds(nodeId, this.state.nodes);
    if (ancestors.length === 0) {
      return;
    }

    const expanded = new Set(this.state.expanded);
    ancestors.forEach((id) => expanded.add(id));

    this.state = {
      ...this.state,
      expanded,
    };
  }

  selectNone(): void {
    this.state = {
      ...this.state,
      selected: new Set(),
    };
  }

  selectOne(nodeId: TreeId): void {
    if (!this.isSelectionAllowed(nodeId)) {
      return;
    }

    this.state = {
      ...this.state,
      selected: new Set([nodeId]),
    };
  }

  selectToggle(nodeId: TreeId): void {
    if (!this.isSelectionAllowed(nodeId)) {
      return;
    }

    const mode = this.selectionMode;
    if (mode.mode === SELECTION_MODES.SINGLE) {
      this.state = {
        ...this.state,
        selected: new Set([nodeId]),
      };
      return;
    }

    const isHierarchical =
      mode.mode === SELECTION_MODES.MULTI && mode.hierarchical;

    const selected = isHierarchical
      ? toggleHierarchicalSelection(nodeId, this.state.nodes, this.state.selected)
      : this.toggleSimpleSelection(nodeId, this.state.selected);

    this.state = {
      ...this.state,
      selected,
    };
  }

  selectRange<TSource>(
    fromId: TreeId,
    toId: TreeId,
    adapter?: TreeAdapter<TSource, T>,
    config?: TreeConfig<T>,
  ): void {
    if (this.selectionMode.mode !== SELECTION_MODES.MULTI) {
      return;
    }

    const rangeIds = adapter
      ? this.getSelectionRangeFromRows(
          fromId,
          toId,
          this.getFilteredFlatList(adapter, config),
        )
      : getSelectionRange(
          fromId,
          toId,
          this.flattenedNodes().filter((node) => node.isVisible),
        );

    const selected = new Set(this.state.selected);
    rangeIds.forEach((id) => {
      if (this.isSelectionAllowed(id)) {
        selected.add(id);
      }
    });

    this.state = {
      ...this.state,
      selected,
    };
  }

  selectBranch(nodeId: TreeId): void {
    if (this.selectionMode.mode !== SELECTION_MODES.MULTI) {
      return;
    }

    const descendants = getDescendantIds(nodeId, this.state.nodes);
    const selected = new Set(this.state.selected);
    selected.add(nodeId);

    descendants.forEach((id) => {
      const node = this.state.nodes.get(id);
      if (node && !node.disabled) {
        selected.add(id);
      }
    });

    this.state = {
      ...this.state,
      selected,
    };
  }

  getVirtualizationStrategy(): 'deep' | 'flat' {
    if (this.virtualizationMode === VIRTUALIZATION_MODES.AUTO) {
      const { total, maxDepth } = this.stats;
      return total > 10000 || maxDepth > 5 ? 'flat' : 'deep';
    }

    return this.virtualizationMode === VIRTUALIZATION_MODES.FLAT
      ? 'flat'
      : 'deep';
  }

  setFilter<TSource>(
    filterInput: TreeFilterInput,
    adapter?: TreeAdapter<TSource, T>,
  ): boolean {
    const normalized = this.normalizeFilterQuery(filterInput);
    if (this.filterFingerprint(this.filterQuery) === this.filterFingerprint(normalized)) {
      return false;
    }

    this.filterQuery = normalized;

    if (normalized && adapter) {
      this.applyFilterPolicies(adapter);
    }

    return true;
  }

  clearFilter(): boolean {
    if (!this.filterQuery) {
      return false;
    }

    this.filterQuery = null;
    return true;
  }

  reapplyFilter<TSource>(adapter: TreeAdapter<TSource, T>): boolean {
    if (!this.filterQuery) {
      return false;
    }

    return this.applyFilterPolicies(adapter);
  }

  getFilteredFlatList<TSource>(
    adapter: TreeAdapter<TSource, T>,
    config?: TreeConfig<T>,
  ): TreeRowViewModel<T>[] {
    const flattened = this.flattenedNodes();
    const selectionData = calculateHierarchicalSelection(
      this.state.nodes,
      this.state.selected,
    );
    const errors = this.state.errors;
    const visibilityState = this.computeFilteredVisibility(adapter, flattened);
    const activeQuery = this.filterQuery;

    const rows: TreeRowViewModel<T>[] = [];

    for (const flatNode of flattened) {
      const node = this.state.nodes.get(flatNode.id);
      if (!node || !visibilityState.visibleIds.has(node.id)) {
        continue;
      }

      if (node.placeholder) {
        rows.push(this.createPlaceholderRow(node));
        continue;
      }

      const data = node.data;
      const label = adapter.getLabel(data);
      const disabled = adapter.isDisabled
        ? adapter.isDisabled(data)
        : !!node.disabled;
      const adapterIcon = adapter.getIcon ? adapter.getIcon(data) : undefined;
      const icon = adapterIcon ?? config?.defaultIcon;
      const isLeaf = this.resolveIsLeaf(adapter, node);
      const highlightRanges =
        activeQuery &&
        this.shouldApplyClientFiltering() &&
        visibilityState.directMatchIds.has(node.id)
          ? this.resolveHighlightRanges(adapter, label, activeQuery)
          : undefined;

      rows.push({
        id: node.id,
        parentId: node.parentId,
        level: node.level,
        label,
        icon: icon ?? null,
        isLeaf,
        disabled,
        visible: true,
        expanded: this.state.expanded.has(node.id),
        selected: selectionData.selected.has(node.id),
        indeterminate: selectionData.indeterminate.has(node.id),
        loading: this.state.loading.has(node.id),
        error: errors.has(node.id),
        highlightRanges,
        childrenIds: node.childrenIds,
        data: node.data,
        placeholder: false,
      });
    }

    return rows;
  }

  getVisibleRows<TSource>(
    adapter: TreeAdapter<TSource, T>,
    config?: TreeConfig<T>,
  ): TreeRowViewModel<T>[] {
    return this.getFilteredFlatList(adapter, config);
  }

  getRowViewModelsById<TSource>(
    adapter: TreeAdapter<TSource, T>,
    config: TreeConfig<T> | undefined,
    ids: TreeId[],
  ): TreeRowViewModel<T>[] {
    if (ids.length === 0) {
      return [];
    }

    const selectionData = calculateHierarchicalSelection(
      this.state.nodes,
      this.state.selected,
    );
    const visibilityState = this.computeFilteredVisibility(
      adapter,
      this.flattenedNodes(),
    );
    const activeQuery = this.filterQuery;

    return ids
      .map((id) => this.state.nodes.get(id))
      .filter((node): node is TreeNode<T> => !!node)
      .map((node) => {
        if (node.placeholder) {
          return this.createPlaceholderRow(
            node,
            visibilityState.visibleIds.has(node.id),
          );
        }

        const data = node.data;
        const label = adapter.getLabel(data);
        const visible = visibilityState.visibleIds.has(node.id);
        const disabled = adapter.isDisabled
          ? adapter.isDisabled(data)
          : !!node.disabled;
        const adapterIcon = adapter.getIcon ? adapter.getIcon(data) : undefined;
        const icon = adapterIcon ?? config?.defaultIcon;
        const isLeaf = this.resolveIsLeaf(adapter, node);
        const highlightRanges =
          activeQuery &&
          this.shouldApplyClientFiltering() &&
          visibilityState.directMatchIds.has(node.id)
            ? this.resolveHighlightRanges(adapter, label, activeQuery)
            : undefined;

        return {
          id: node.id,
          parentId: node.parentId,
          level: node.level,
          label,
          icon: icon ?? null,
          isLeaf,
          disabled,
          visible,
          expanded: this.state.expanded.has(node.id),
          selected: selectionData.selected.has(node.id),
          indeterminate: selectionData.indeterminate.has(node.id),
          loading: this.state.loading.has(node.id),
          error: this.state.errors.has(node.id),
          highlightRanges,
          childrenIds: node.childrenIds,
          data: node.data,
          placeholder: false,
        };
      });
  }

  private createPlaceholderRow(
    node: TreeNode<T>,
    visible = true,
  ): TreeRowViewModel<T> {
    const parentId = node.parentId ?? null;
    const placeholderIndex = typeof node.placeholderIndex === 'number' ? node.placeholderIndex : 0;
    const pagedState = parentId ? this.pagedChildren.get(parentId) : undefined;

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

  private resolveIsLeaf<TSource>(
    adapter: TreeAdapter<TSource, T>,
    node: TreeNode<T>,
  ): boolean {
    if (node.placeholder) {
      return true;
    }

    if (typeof node.isLeaf === 'boolean') {
      return node.isLeaf;
    }

    if (adapter.isLeaf) {
      const result = adapter.isLeaf(node.data);
      if (typeof result === 'boolean') {
        return result;
      }
    }

    if (node.childrenIds) {
      return node.childrenIds.length === 0;
    }

    if (adapter.hasChildren) {
      const result = adapter.hasChildren(node.data);
      if (typeof result === 'boolean') {
        return !result;
      }
    }

    return false;
  }

  private flattenedNodes() {
    return flattenTree(this.state.nodes, this.state.expanded);
  }

  private computeFilteredVisibility<TSource>(
    adapter: TreeAdapter<TSource, T>,
    flattened: ReturnType<typeof flattenTree>,
  ): FilteredVisibilityState {
    const activeQuery = this.filterQuery;
    const hasQuery = !!activeQuery;
    const shouldApplyClientFiltering = this.shouldApplyClientFiltering();
    const flattenedIds = new Set<TreeId>(flattened.map((node) => node.id));
    const baseVisibleIds = new Set<TreeId>();
    const directMatchIds = new Set<TreeId>();

    for (const flatNode of flattened) {
      const node = this.state.nodes.get(flatNode.id);
      if (!node || node.placeholder) {
        continue;
      }

      const data = node.data;
      if (!this.isLegacyVisible(adapter, data)) {
        continue;
      }

      const label = adapter.getLabel(data);
      baseVisibleIds.add(node.id);

      if (
        !hasQuery ||
        !shouldApplyClientFiltering ||
        this.matchesActiveFilter(adapter, data, label, activeQuery)
      ) {
        directMatchIds.add(node.id);
      }
    }

    const visibleIds = new Set<TreeId>();
    const visibleContentIds = hasQuery
      ? new Set(directMatchIds)
      : new Set(baseVisibleIds);

    if (hasQuery && this.filterConfig.showParentsOfMatches) {
      for (const matchId of directMatchIds) {
        const ancestors = getAncestorIds(matchId, this.state.nodes);
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
      const node = this.state.nodes.get(flatNode.id);
      if (!node?.placeholder) {
        continue;
      }

      if (hasQuery && !this.filterConfig.keepPlaceholdersVisible) {
        continue;
      }

      if (!node.parentId || !hasQuery || visibleContentIds.has(node.parentId)) {
        visibleIds.add(node.id);
      }
    }

    return { visibleIds, directMatchIds };
  }

  private applyFilterPolicies<TSource>(
    adapter: TreeAdapter<TSource, T>,
  ): boolean {
    let changed = false;
    const filterMode = this.filterConfig.mode;

    if (
      filterMode !== 'server' &&
      this.filterConfig.autoExpandMatches &&
      this.filterQuery
    ) {
      changed = this.autoExpandMatchedAncestors(adapter) || changed;
    }

    if (
      this.filterConfig.selectionPolicy === 'clearHidden' &&
      this.filterQuery
    ) {
      changed = this.clearHiddenSelection(adapter) || changed;
    }

    return changed;
  }

  private autoExpandMatchedAncestors<TSource>(
    adapter: TreeAdapter<TSource, T>,
  ): boolean {
    const activeQuery = this.filterQuery;
    if (!activeQuery) {
      return false;
    }

    const ancestorsToExpand = new Set<TreeId>();
    for (const node of this.state.nodes.values()) {
      if (node.placeholder) {
        continue;
      }

      const data = node.data;
      if (!this.isLegacyVisible(adapter, data)) {
        continue;
      }

      const label = adapter.getLabel(data);
      if (!this.matchesActiveFilter(adapter, data, label, activeQuery)) {
        continue;
      }

      const ancestors = getAncestorIds(node.id, this.state.nodes);
      for (const ancestorId of ancestors) {
        ancestorsToExpand.add(ancestorId);
      }
    }

    if (ancestorsToExpand.size === 0) {
      return false;
    }

    const expanded = new Set(this.state.expanded);
    const previousSize = expanded.size;
    for (const ancestorId of ancestorsToExpand) {
      expanded.add(ancestorId);
    }

    if (expanded.size === previousSize) {
      return false;
    }

    this.state = {
      ...this.state,
      expanded,
    };

    return true;
  }

  private clearHiddenSelection<TSource>(
    adapter: TreeAdapter<TSource, T>,
  ): boolean {
    if (this.state.selected.size === 0) {
      return false;
    }

    const visibility = this.computeFilteredVisibility(adapter, this.flattenedNodes());
    const selected = new Set<TreeId>();

    for (const nodeId of this.state.selected) {
      if (visibility.visibleIds.has(nodeId)) {
        selected.add(nodeId);
      }
    }

    if (selected.size === this.state.selected.size) {
      return false;
    }

    this.state = {
      ...this.state,
      selected,
    };

    return true;
  }

  private normalizeFilterQuery(
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

  private filterFingerprint(query: TreeFilterQuery | null): string {
    if (!query) {
      return '';
    }
    return JSON.stringify(query);
  }

  private isLegacyVisible<TSource>(
    adapter: TreeAdapter<TSource, T>,
    data: T,
  ): boolean {
    return adapter.isVisible ? adapter.isVisible(data) : true;
  }

  private matchesActiveFilter<TSource>(
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
    const terms = this.queryTerms(query);

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

  private queryTerms(query: TreeFilterQuery): string[] {
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

  private resolveHighlightRanges<TSource>(
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

  private isSelectionAllowed(nodeId: TreeId): boolean {
    if (this.selectionMode.mode === SELECTION_MODES.NONE) {
      return false;
    }

    const node = this.getNode(nodeId);
    if (!node) {
      return false;
    }

    return !node.disabled && !node.placeholder;
  }

  private toggleSimpleSelection(
    nodeId: TreeId,
    currentSelection: Set<TreeId>,
  ): Set<TreeId> {
    const newSelection = new Set(currentSelection);
    if (newSelection.has(nodeId)) {
      newSelection.delete(nodeId);
    } else {
      newSelection.add(nodeId);
    }
    return newSelection;
  }

  private placeholderId(parentId: TreeId, index: number): TreeId {
    return `__tree_placeholder__${parentId}__${index}`;
  }

  private shouldApplyClientFiltering(): boolean {
    const mode: TreeFilterMode = this.filterConfig.mode;
    return mode !== 'server';
  }

  private getSelectionRangeFromRows(
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
}

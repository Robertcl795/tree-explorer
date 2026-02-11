import { TreeAdapter } from '../types/tree-adapter';
import {
  SELECTION_MODES,
  SelectionMode,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '../types/tree-config';
import {
  DEFAULT_TREE_FILTERING_CONFIG,
  TreeFilterInput,
  TreeFilteringConfig,
  TreeFilterQuery,
} from '../types/tree-filter';
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';
import { PageRequest, TreePaginationConfig } from '../types/tree-pagination';
import { FlattenedNode, getMaxDepth } from '../utils/tree-utils';
import {
  clearChildrenState,
  toggleExpandState,
} from './expansion';
import {
  createFlattenedNodesCache,
  getFlattenedNodesCached,
} from './flattening';
import { clearLoadingState, clearNodeErrorState, setNodeErrorState } from './loading';
import { buildNavigationPath, ensurePathExpanded } from './navigation';
import { descendantIdsFor } from './node-index';
import {
  applyPagedChildrenState,
  clearPageErrorState,
  clearPageInFlightState,
  ensureRangeLoadedPages,
  getPagedNodeDebugState,
  hasPagination,
  markPageInFlightState,
  primePagedPlaceholdersState,
  setChildrenLoadedState,
  setPageErrorState,
  setPaginationConfig,
} from './paging';
import {
  isSelectionAllowed,
  selectOne,
  selectRangeFromFlattened,
  selectRangeFromRows,
  selectToggle,
} from './selection';
import {
  TreePagedNodeDebugState,
  TreePagedNodeState,
  TreeEngineProjection,
  TreeProjectionCache,
  TreeState,
  TreeStats,
} from './types';
import {
  createInitialTreeState,
  createTreeStateFromNodes,
  fingerprintFilterConfig,
  mergeFilteringConfig,
} from './utils';
import {
  buildProjection,
  cloneFilterQuery,
  collectMatchAncestorIds,
  computeFilteredVisibility,
  filterFingerprint,
  normalizeFilterQuery,
  projectionRowsByIds,
  projectionToVisibleRows,
  shouldApplyClientFiltering,
} from './visibility';

export type { TreePagedNodeDebugState, TreeStats } from './types';

export class TreeEngine<T> {
  private state: TreeState<T> = createInitialTreeState<T>();
  private readonly pagedChildren = new Map<TreeId, TreePagedNodeState>();
  private selectionMode: SelectionMode = { mode: SELECTION_MODES.NONE };
  private virtualizationMode = VIRTUALIZATION_MODES.AUTO;
  private filterQuery: TreeFilterQuery | null = null;
  private filterConfig: Required<TreeFilteringConfig> = {
    ...DEFAULT_TREE_FILTERING_CONFIG,
  };

  private pagingVersion = 0;
  private readonly flattenedCache = createFlattenedNodesCache<T>();
  private projectionCache: TreeProjectionCache<unknown, T> | null = null;

  configure(config?: Partial<TreeConfig<T>>): void {
    if (config?.selection) {
      this.selectionMode = config.selection;
    }

    if (config?.virtualization?.mode) {
      this.virtualizationMode = config.virtualization.mode;
    }

    if (config?.filtering) {
      this.filterConfig = mergeFilteringConfig(config.filtering);
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
    const flattened = this.getFlattenedNodes();
    let visibleCount = 0;

    for (const node of flattened) {
      if (node.isVisible) {
        visibleCount += 1;
      }
    }

    return {
      total: this.state.nodes.size,
      visible: visibleCount,
      expanded: this.state.expanded.size,
      selected: this.state.selected.size,
      loading: this.state.loading.size,
      maxDepth: getMaxDepth(this.state.nodes),
    };
  }

  getFilterQuery(): TreeFilterQuery | null {
    return cloneFilterQuery(this.filterQuery);
  }

  init(nodesInput: TreeNode<T>[]): void {
    this.state = createTreeStateFromNodes(nodesInput);
    this.pagedChildren.clear();
    this.pagingVersion += 1;
  }

  getNode(id: TreeId): TreeNode<T> | undefined {
    return this.state.nodes.get(id);
  }

  setPagination(parentId: TreeId, config: TreePaginationConfig): void {
    if (setPaginationConfig(this.pagedChildren, parentId, config)) {
      this.pagingVersion += 1;
    }
  }

  hasPagination(parentId: TreeId): boolean {
    return hasPagination(this.pagedChildren, parentId);
  }

  getPagedNodeDebugState(parentId: TreeId): TreePagedNodeDebugState | undefined {
    return getPagedNodeDebugState(this.pagedChildren, parentId);
  }

  toggleExpand(nodeId: TreeId, canLoadChildren: boolean): boolean {
    const result = toggleExpandState(this.state, nodeId, canLoadChildren);
    this.state = result.nextState;
    return result.shouldLoadChildren;
  }

  markPageInFlight(parentId: TreeId, pageIndex: number): boolean {
    const result = markPageInFlightState(
      this.state,
      this.pagedChildren,
      parentId,
      pageIndex,
    );
    if (!result.marked) {
      return false;
    }

    this.state = result.nextState;
    this.pagingVersion += 1;
    return true;
  }

  ensureRangeLoaded(
    parentId: TreeId,
    range: { start: number; end: number },
  ): number[] {
    const result = ensureRangeLoadedPages(
      this.state,
      this.pagedChildren,
      parentId,
      range,
    );

    if (result.changed) {
      this.state = result.nextState;
      this.pagingVersion += 1;
    }

    return result.pagesToLoad;
  }

  setChildrenLoaded(
    parentId: TreeId,
    children: TreeNode<T>[],
    allNodes: TreeNode<T>[] = children,
  ): void {
    this.state = setChildrenLoadedState(
      this.state,
      this.pagedChildren,
      parentId,
      children,
      allNodes,
    );
    this.pagingVersion += 1;
  }

  primePagedPlaceholders(parentId: TreeId, totalCount: number): void {
    this.state = primePagedPlaceholdersState(
      this.state,
      this.pagedChildren,
      parentId,
      totalCount,
    );
    this.pagingVersion += 1;
  }

  applyPagedChildren(
    parentId: TreeId,
    request: PageRequest,
    children: TreeNode<T>[],
    totalCount: number,
    allNodes: TreeNode<T>[] = children,
  ): void {
    this.state = applyPagedChildrenState(
      this.state,
      this.pagedChildren,
      parentId,
      request,
      children,
      totalCount,
      allNodes,
    );
    this.pagingVersion += 1;
  }

  clearPageInFlight(parentId: TreeId, pageIndex: number): void {
    this.state = clearPageInFlightState(
      this.state,
      this.pagedChildren,
      parentId,
      pageIndex,
    );
    this.pagingVersion += 1;
  }

  setPageError(parentId: TreeId, pageIndex: number, error: unknown): void {
    this.state = setPageErrorState(
      this.state,
      this.pagedChildren,
      parentId,
      pageIndex,
      error,
    );
    this.pagingVersion += 1;
  }

  clearPageError(parentId: TreeId, pageIndex: number): void {
    this.state = clearPageErrorState(
      this.state,
      this.pagedChildren,
      parentId,
      pageIndex,
    );
    this.pagingVersion += 1;
  }

  clearLoading(nodeId: TreeId): void {
    this.state = clearLoadingState(this.state, nodeId);
  }

  setNodeError(nodeId: TreeId, error: unknown): void {
    this.state = setNodeErrorState(this.state, nodeId, error);
  }

  clearNodeError(nodeId: TreeId): void {
    this.state = clearNodeErrorState(this.state, nodeId);
  }

  clearChildren(parentId: TreeId): void {
    const parent = this.state.nodes.get(parentId);
    if (!parent) {
      return;
    }

    const descendants = descendantIdsFor(parentId, this.state.nodes);
    this.state = clearChildrenState(this.state, parent, descendants);
    this.pagedChildren.delete(parentId);
    this.pagingVersion += 1;
  }

  expandPath(nodeId: TreeId): void {
    const path = buildNavigationPath(nodeId, this.state.nodes);
    if (path.length === 0) {
      return;
    }

    const expanded = ensurePathExpanded(this.state.expanded, path);
    if (expanded.size === this.state.expanded.size) {
      return;
    }

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
    const selected = selectOne(this.selectionMode, this.state.nodes, nodeId);
    if (!selected) {
      return;
    }

    this.state = {
      ...this.state,
      selected,
    };
  }

  selectToggle(nodeId: TreeId): void {
    const selected = selectToggle(
      this.selectionMode,
      this.state.nodes,
      this.state.selected,
      nodeId,
    );
    if (!selected) {
      return;
    }

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
      ? selectRangeFromRows(fromId, toId, this.getFilteredFlatList(adapter, config))
      : selectRangeFromFlattened(
          fromId,
          toId,
          this.getFlattenedNodes().filter((node) => node.isVisible),
        );

    const selected = new Set(this.state.selected);
    for (const id of rangeIds) {
      if (isSelectionAllowed(this.selectionMode, this.state.nodes, id)) {
        selected.add(id);
      }
    }

    this.state = {
      ...this.state,
      selected,
    };
  }

  selectBranch(nodeId: TreeId): void {
    if (this.selectionMode.mode !== SELECTION_MODES.MULTI) {
      return;
    }

    const descendants = descendantIdsFor(nodeId, this.state.nodes);
    const selected = new Set(this.state.selected);
    selected.add(nodeId);

    for (const id of descendants) {
      const node = this.state.nodes.get(id);
      if (node && !node.disabled) {
        selected.add(id);
      }
    }

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
    const normalized = normalizeFilterQuery(filterInput);
    if (filterFingerprint(this.filterQuery) === filterFingerprint(normalized)) {
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
    const projection = this.getProjection(adapter, config);
    return projectionToVisibleRows(projection);
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

    const projection = this.getProjection(adapter, config);
    return projectionRowsByIds(projection, ids);
  }

  private applyFilterPolicies<TSource>(
    adapter: TreeAdapter<TSource, T>,
  ): boolean {
    let changed = false;

    if (
      this.filterConfig.mode !== 'server' &&
      this.filterConfig.autoExpandMatches &&
      this.filterQuery &&
      shouldApplyClientFiltering(this.filterConfig)
    ) {
      const ancestorsToExpand = collectMatchAncestorIds(
        this.state,
        adapter,
        this.filterQuery,
      );
      if (ancestorsToExpand.size > 0) {
        const expanded = new Set(this.state.expanded);
        const previousSize = expanded.size;
        for (const ancestorId of ancestorsToExpand) {
          expanded.add(ancestorId);
        }

        if (expanded.size !== previousSize) {
          this.state = {
            ...this.state,
            expanded,
          };
          changed = true;
        }
      }
    }

    if (
      this.filterConfig.selectionPolicy === 'clearHidden' &&
      this.filterQuery &&
      this.state.selected.size > 0
    ) {
      const visibility = computeFilteredVisibility(
        this.state,
        adapter,
        this.getFlattenedNodes(),
        this.filterQuery,
        this.filterConfig,
      );

      const selected = new Set<TreeId>();
      for (const nodeId of this.state.selected) {
        if (visibility.visibleIds.has(nodeId)) {
          selected.add(nodeId);
        }
      }

      if (selected.size !== this.state.selected.size) {
        this.state = {
          ...this.state,
          selected,
        };
        changed = true;
      }
    }

    return changed;
  }

  private getFlattenedNodes(): FlattenedNode[] {
    return getFlattenedNodesCached(
      this.state.nodes,
      this.state.expanded,
      this.flattenedCache,
    );
  }

  private getProjection<TSource>(
    adapter: TreeAdapter<TSource, T>,
    config?: TreeConfig<T>,
  ): TreeEngineProjection<T> {
    const activeFilterFingerprint = filterFingerprint(this.filterQuery);
    const activeFilterConfigFingerprint = fingerprintFilterConfig(this.filterConfig);
    const defaultIcon = config?.defaultIcon;

    const cache = this.projectionCache;
    if (
      cache &&
      cache.adapterRef === adapter &&
      cache.defaultIcon === defaultIcon &&
      cache.nodesRef === this.state.nodes &&
      cache.expandedRef === this.state.expanded &&
      cache.selectedRef === this.state.selected &&
      cache.loadingRef === this.state.loading &&
      cache.errorsRef === this.state.errors &&
      cache.filterFingerprint === activeFilterFingerprint &&
      cache.filterMode === this.filterConfig.mode &&
      cache.filterConfigFingerprint === activeFilterConfigFingerprint &&
      cache.pagingVersion === this.pagingVersion
    ) {
      return cache.projection;
    }

    const projection = buildProjection({
      state: this.state,
      pagedChildren: this.pagedChildren,
      adapter,
      config,
      flattened: this.getFlattenedNodes(),
      filterQuery: this.filterQuery,
      filterConfig: this.filterConfig,
    });

    this.projectionCache = {
      adapterRef: adapter,
      defaultIcon,
      nodesRef: this.state.nodes,
      expandedRef: this.state.expanded,
      selectedRef: this.state.selected,
      loadingRef: this.state.loading,
      errorsRef: this.state.errors,
      filterFingerprint: activeFilterFingerprint,
      filterMode: this.filterConfig.mode,
      filterConfigFingerprint: activeFilterConfigFingerprint,
      pagingVersion: this.pagingVersion,
      projection,
    };

    return projection;
  }
}

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

  configure(config?: Partial<TreeConfig<T>>): void {
    if (config?.selection) {
      this.selectionMode = config.selection;
    }
    if (config?.virtualization?.mode) {
      this.virtualizationMode = config.virtualization.mode;
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

  selectRange(fromId: TreeId, toId: TreeId): void {
    if (this.selectionMode.mode !== SELECTION_MODES.MULTI) {
      return;
    }

    const flattened = this.flattenedNodes().filter((node) => node.isVisible);
    const rangeIds = getSelectionRange(fromId, toId, flattened);

    const selected = new Set(this.state.selected);
    rangeIds.forEach((id) => selected.add(id));

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

  getVisibleRows<TSource>(
    adapter: TreeAdapter<TSource, T>,
    config?: TreeConfig<T>,
  ): TreeRowViewModel<T>[] {
    const flattened = this.flattenedNodes();
    const selectionData = calculateHierarchicalSelection(
      this.state.nodes,
      this.state.selected,
    );
    const errors = this.state.errors;

    const rows: TreeRowViewModel<T>[] = [];

    for (const flatNode of flattened) {
      const node = this.state.nodes.get(flatNode.id);
      if (!node) {
        continue;
      }

      if (node.placeholder) {
        rows.push(this.createPlaceholderRow(node));
        continue;
      }

      const data = node.data;
      const visible = adapter.isVisible ? adapter.isVisible(data) : true;
      if (!visible) {
        continue;
      }

      const disabled = adapter.isDisabled
        ? adapter.isDisabled(data)
        : !!node.disabled;
      const label = adapter.getLabel(data);
      const adapterIcon = adapter.getIcon ? adapter.getIcon(data) : undefined;
      const icon = adapterIcon ?? config?.defaultIcon;
      const isLeaf = this.resolveIsLeaf(adapter, node);

      rows.push({
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
        error: errors.has(node.id),
        childrenIds: node.childrenIds,
        data: node.data,
        placeholder: false,
      });
    }

    return rows;
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

    return ids
      .map((id) => this.state.nodes.get(id))
      .filter((node): node is TreeNode<T> => !!node)
      .map((node) => {
        if (node.placeholder) {
          return this.createPlaceholderRow(node);
        }

        const data = node.data;
        const visible = adapter.isVisible ? adapter.isVisible(data) : true;
        const disabled = adapter.isDisabled
          ? adapter.isDisabled(data)
          : !!node.disabled;
        const label = adapter.getLabel(data);
        const adapterIcon = adapter.getIcon ? adapter.getIcon(data) : undefined;
        const icon = adapterIcon ?? config?.defaultIcon;
        const isLeaf = this.resolveIsLeaf(adapter, node);

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
          childrenIds: node.childrenIds,
          data: node.data,
          placeholder: false,
        };
      });
  }

  private createPlaceholderRow(node: TreeNode<T>): TreeRowViewModel<T> {
    const parentId = node.parentId ?? null;
    const placeholderIndex = typeof node.placeholderIndex === 'number' ? node.placeholderIndex : 0;
    const pagedState = parentId ? this.pagedChildren.get(parentId) : undefined;

    const pageIndex = pagedState
      ? Math.floor(placeholderIndex / pagedState.pageSize)
      : null;
    const loading = pageIndex !== null && !!pagedState?.inFlightPages.has(pageIndex);
    const error = pageIndex !== null && !!pagedState?.pageErrors.has(pageIndex);

    return {
      id: node.id,
      parentId,
      level: node.level,
      label: error ? 'Failed to load page' : 'Loading...',
      icon: null,
      isLeaf: true,
      disabled: true,
      visible: true,
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
}

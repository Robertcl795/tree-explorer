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
import { TreeId, TreeNode, TreeRowViewModel } from '../types/tree-node';

interface TreeState<T> {
  nodes: Map<TreeId, TreeNode<T>>;
  expanded: Set<TreeId>;
  selected: Set<TreeId>;
  loading: Set<TreeId>;
  errors: Map<TreeId, unknown>;
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

  init(roots: TreeNode<T>[]): void {
    const nodes = new Map<TreeId, TreeNode<T>>();
    roots.forEach((node) => nodes.set(node.id, node));

    this.state = {
      nodes,
      expanded: new Set(),
      selected: new Set(),
      loading: new Set(),
      errors: new Map(),
    };
  }

  getNode(id: TreeId): TreeNode<T> | undefined {
    return this.state.nodes.get(id);
  }

  toggleExpand(nodeId: TreeId, canLoadChildren: boolean): boolean {
    const node = this.getNode(nodeId);
    if (!node || node.isLeaf) {
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

  setChildrenLoaded(parentId: TreeId, children: TreeNode<T>[]): void {
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

    children.forEach((child) => nodes.set(child.id, child));
    loading.delete(parentId);

    this.state = {
      ...this.state,
      nodes,
      loading,
    };
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
        };
      });
  }

  private resolveIsLeaf<TSource>(
    adapter: TreeAdapter<TSource, T>,
    node: TreeNode<T>,
  ): boolean {
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

    return !node.disabled;
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
}


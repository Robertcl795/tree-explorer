import {
  CdkDragDrop,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import '@covalent/components/circular-progress';
import '@covalent/components/divider';
import '@covalent/components/icon';
import '@covalent/components/icon-button';
import '@covalent/components/linear-progress';
import '@covalent/components/list-item';
import '@covalent/components/menu';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  DEFAULT_TREE_CONFIG,
  SELECTION_MODES,
  TREE_DENSITY,
  VIRTUALIZATION_MODES,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeContextAction,
  TreeContextMenuEvent,
  TreeFilterInput,
  TreeLoadError,
  TreeNode,
  TreeNodeEvent,
  TreePinnedEntry,
  TreePinnedItemView,
  TreePinnedNodeContext,
  TreeRowViewModel,
  TreeSelectionEvent,
  TreeDragEvent,
  TreeStateService,
} from '../../../core';
import { TreeItemComponent } from '../tree-item/tree-item.component';

@Component({
  selector: 'tree-explorer',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    ScrollingModule,
    TreeItemComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [TreeStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tree-explorer.component.html',
  styleUrls: ['./tree-explorer.component.scss'],
  host: {
    class: 'td-tree',
    '[attr.role]': '"tree"',
    '[attr.aria-label]': 'treeConfig().ariaLabel',
    '[attr.tabindex]': '0',
    '[attr.data-density]': 'displayConfig().density',
  },
})
export class TreeExplorerComponent<TSource, T = TSource> {
  private static readonly PIN_ACTION_ID = '__tree_pin__';
  private static readonly UNPIN_ACTION_ID = '__tree_unpin__';
  private lastRenderedRange: { start: number; end: number } | null = null;
  private pendingRange: { start: number; end: number } | null = null;
  private rangeRafId: number | null = null;

  public readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');

  public readonly data = input<TreeChildrenResult<TSource> | TSource[]>([]);
  public readonly loading = input(false);
  public readonly adapter = input.required<TreeAdapter<TSource, T>>();
  public readonly config = input<Partial<TreeConfig<T>>>({});
  public readonly filterQuery = input<TreeFilterInput>(null);

  public readonly itemClick = output<TreeNodeEvent<T>>();
  public readonly itemDoubleClick = output<TreeNodeEvent<T>>();
  public readonly itemToggleExpand = output<TreeNodeEvent<T>>();
  public readonly itemToggleSelect = output<TreeNodeEvent<T>>();
  public readonly selectionChange = output<TreeSelectionEvent<T>>();
  public readonly contextMenuAction = output<TreeContextMenuEvent<T>>();
  public readonly loadError = output<TreeLoadError>();
  public readonly dragStart = output<TreeDragEvent<T>>();
  public readonly dragOver = output<TreeDragEvent<T>>();
  public readonly drop = output<TreeDragEvent<T>>();
  public readonly dragEnd = output<TreeDragEvent<T>>();

  protected readonly treeService = inject(TreeStateService<TSource, T>);

  public readonly contextRow = signal<TreeRowViewModel<T> | null>(null);
  public readonly contextNode = signal<TreeNode<T> | null>(null);
  public readonly contextPinnedItem = signal<TreePinnedItemView<T> | null>(null);
  public readonly contextTarget = signal<'node' | 'pinned' | null>(null);
  public readonly contextEvent = signal<MouseEvent | null>(null);
  public readonly currentContextButton = signal<HTMLElement | null>(null);
  public readonly isContextMenuOpen = signal(false);

  public readonly treeConfig = computed(() =>
    this.mergeConfig(this.config()),
  );

  public readonly displayConfig = computed(() => ({
    indentPx: this.treeConfig().display?.indentPx ?? 24,
    density: this.treeConfig().display?.density ?? TREE_DENSITY.NORMAL,
    showIcons: this.treeConfig().display?.showIcons ?? true,
  }));

  public readonly itemSize = computed(
    () => this.treeConfig().virtualization?.itemSize ?? 48,
  );

  public readonly useVirtualScroll = computed(() => {
    const mode = this.treeConfig().virtualization?.mode ?? VIRTUALIZATION_MODES.AUTO;
    if (mode !== VIRTUALIZATION_MODES.AUTO) {
      return true;
    }

    const rows = this.visibleRows();
    const hasPlaceholders = rows.some((row) => row.placeholder);
    return hasPlaceholders || rows.length > 200;
  });

  public readonly isLoading = computed(
    () => this.loading() || this.treeService.loading(),
  );

  public readonly isRootLoading = computed(
    () => this.treeService.rootLoadingState(),
  );

  public readonly rootLoadError = computed(
    () => this.treeService.rootLoadError(),
  );

  public readonly visibleRows = computed(() => this.treeService.visibleRows());
  public readonly pinnedItems = computed(() => this.treeService.pinnedItems());
  public readonly pinnedConfig = computed(() => this.treeService.pinnedConfig());
  public readonly pinnedLoading = computed(() => this.treeService.pinnedLoading());
  public readonly pinnedError = computed(() => this.treeService.pinnedError());
  public readonly pinnedCollapsed = signal(false);
  public readonly pinnedSectionVisible = computed(
    () =>
      this.pinnedConfig().enabled &&
      (this.pinnedItems().length > 0 || this.pinnedLoading() || !!this.pinnedError()),
  );
  public readonly pinnedDndEnabled = computed(
    () => this.pinnedConfig().enabled && this.pinnedConfig().dndEnabled,
  );

  constructor() {
    effect(() => {
      this.treeService.setAdapter(this.adapter());
    });

    effect(() => {
      this.treeService.setConfig(this.treeConfig());
    });

    effect(() => {
      this.treeService.setSources(this.data());
    });

    effect(() => {
      const query = this.filterQuery();
      const shouldClear =
        query === null ||
        query === undefined ||
        (typeof query === 'string' && query.trim().length === 0);

      if (shouldClear) {
        this.treeService.clearFilter();
        return;
      }

      this.treeService.setFilter(query);
    });

    effect(() => {
      const selected = Array.from(this.treeService.selectedIds())
        .map((id) => this.treeService.getNode(id))
        .filter((node): node is TreeNode<T> => !!node);
      this.selectionChange.emit({ nodes: selected });
    });

    effect(() => {
      const error = this.treeService.loadError();
      if (error) {
        this.loadError.emit(error);
      }
    });

    effect(() => {
      const viewport = this.viewport();
      if (!viewport || !this.useVirtualScroll()) {
        return;
      }
      this.itemSize();
      viewport.checkViewportSize();
    });

    effect((onCleanup) => {
      const viewport = this.viewport();
      if (!viewport || !this.useVirtualScroll()) {
        return;
      }

      const renderedSubscription = viewport.renderedRangeStream.subscribe((range) => {
        if (
          this.lastRenderedRange &&
          this.lastRenderedRange.start === range.start &&
          this.lastRenderedRange.end === range.end
        ) {
          return;
        }
        this.lastRenderedRange = { start: range.start, end: range.end };
        this.pendingRange = { start: range.start, end: range.end };

        const rows = this.visibleRows();
        const sliceEnd = Math.min(range.end, rows.length);
        const hasPlaceholder = rows
          .slice(range.start, sliceEnd)
          .some((row) => row.placeholder);
        if (!hasPlaceholder) {
          return;
        }

        if (this.rangeRafId !== null) {
          return;
        }

        const requestFrame = globalThis.requestAnimationFrame;
        if (typeof requestFrame !== 'function') {
          const pending = this.pendingRange;
          if (pending) {
            this.treeService.ensureRangeLoaded(pending.start, pending.end);
          }
          return;
        }

        this.rangeRafId = requestFrame(() => {
          this.rangeRafId = null;
          const pending = this.pendingRange;
          if (pending) {
            this.treeService.ensureRangeLoaded(pending.start, pending.end);
          }
        });
      });

      onCleanup(() => {
        if (this.rangeRafId !== null) {
          const cancelFrame = globalThis.cancelAnimationFrame;
          if (typeof cancelFrame === 'function') {
            cancelFrame(this.rangeRafId);
          }
          this.rangeRafId = null;
        }
        renderedSubscription.unsubscribe();
      });
    });
  }

  public hasContextActions(row: TreeRowViewModel<T>): boolean {
    if (row.placeholder || row.disabled) {
      return false;
    }
    const node = this.treeService.getNode(row.id);
    if (!node) {
      return false;
    }
    return this.getNodeContextActions(row, node).length > 0;
  }

  public hasPinnedContextActions(item: TreePinnedItemView<T>): boolean {
    return this.getPinnedContextActions(item).length > 0;
  }

  public togglePinnedCollapsed(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.pinnedCollapsed.update((collapsed) => !collapsed);
  }

  public trackByPinnedEntry = (
    _: number,
    item: TreePinnedItemView<T>,
  ): string => item.entry.entryId;

  public onPinnedDrop(event: CdkDragDrop<TreePinnedItemView<T>[]>): void {
    if (!this.pinnedDndEnabled()) {
      return;
    }
    void this.treeService.reorderPinned(event.previousIndex, event.currentIndex);
  }

  public onRowClick(event: MouseEvent, row: TreeRowViewModel<T>): void {
    if (row.placeholder) {
      return;
    }

    const node = this.treeService.getNode(row.id);
    if (!node) {
      return;
    }

    if (
      this.treeConfig().selection?.mode !== SELECTION_MODES.NONE &&
      !row.disabled
    ) {
      this.treeService.toggleSelect(row);
      this.itemToggleSelect.emit({ node, row, event });
    }

    this.itemClick.emit({ node, row, event });
  }

  public onPinnedClick(event: MouseEvent, item: TreePinnedItemView<T>): void {
    event.preventDefault();
    event.stopPropagation();

    void this.navigateToNode(item.entry.nodeId);
  }

  public onRowDoubleClick(event: MouseEvent, row: TreeRowViewModel<T>): void {
    if (row.placeholder) {
      return;
    }

    const node = this.treeService.getNode(row.id);
    if (!node) {
      return;
    }

    if (!row.disabled && !row.isLeaf) {
      this.treeService.toggleExpand(row);
      this.itemToggleExpand.emit({ node, row, event });
    }

    this.itemDoubleClick.emit({ node, row, event });
  }

  public onToggleExpand(event: MouseEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (!node || row.disabled || row.isLeaf || row.placeholder) {
      return;
    }

    this.treeService.toggleExpand(row);
    this.itemToggleExpand.emit({ node, row, event });
  }

  public onToggleSelect(event: Event, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (!node || row.disabled || row.placeholder) {
      return;
    }

    if (this.treeConfig().selection?.mode !== SELECTION_MODES.NONE) {
      this.treeService.toggleSelect(row);
      this.itemToggleSelect.emit({ node, row, event });
    }
  }

  public onDragStart(event: DragEvent, row: TreeRowViewModel<T>): void {
    if (row.placeholder) {
      return;
    }

    const node = this.treeService.getNode(row.id);
    const adapter = this.adapter();
    if (!node || !adapter || !event.dataTransfer) {
      return;
    }

    const payload = adapter.getDragData ? adapter.getDragData(row.data, node) : row.data;
    event.dataTransfer.effectAllowed = 'copyMove';
    if (typeof payload === 'string') {
      event.dataTransfer.setData('text/plain', payload);
    } else {
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
    }

    this.dragStart.emit({ node, row, event });
  }

  public onDragOver(event: DragEvent, row: TreeRowViewModel<T>): void {
    event.preventDefault();
    const node = this.treeService.getNode(row.id);
    if (node && !row.placeholder) {
      this.dragOver.emit({ node, row, event });
    }
  }

  public onDrop(event: DragEvent, row: TreeRowViewModel<T>): void {
    event.preventDefault();
    const node = this.treeService.getNode(row.id);
    if (node && !row.placeholder) {
      this.drop.emit({ node, row, event });
    }
  }

  public onDragEnd(event: DragEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (node && !row.placeholder) {
      this.dragEnd.emit({ node, row, event });
    }
  }

  public openContextMenu(event: MouseEvent, row: TreeRowViewModel<T>): void {
    if (row.placeholder) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const node = this.treeService.getNode(row.id);
    if (!node) {
      return;
    }

    if (!this.hasContextActions(row)) {
      return;
    }

    this.contextRow.set(row);
    this.contextNode.set(node);
    this.contextPinnedItem.set(null);
    this.contextTarget.set('node');
    this.contextEvent.set(event);
    this.currentContextButton.set(
      (event.currentTarget ?? event.target) as HTMLElement,
    );
    this.isContextMenuOpen.set(true);
  }

  public openPinnedContextMenu(
    event: MouseEvent,
    item: TreePinnedItemView<T>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPinnedContextActions(item)) {
      return;
    }

    this.contextPinnedItem.set(item);
    this.contextTarget.set('pinned');
    this.contextNode.set(item.node);
    this.contextRow.set(item.row);
    this.contextEvent.set(event);
    this.currentContextButton.set(
      (event.currentTarget ?? event.target) as HTMLElement,
    );
    this.isContextMenuOpen.set(true);
  }

  public onContextAction(action: TreeContextAction<T>): void {
    const event = this.contextEvent();
    if (!event) {
      return;
    }

    try {
      if (action.id === TreeExplorerComponent.PIN_ACTION_ID) {
        const node = this.contextNode();
        if (node) {
          void this.treeService.pinNode(node.id);
        }
      } else if (action.id === TreeExplorerComponent.UNPIN_ACTION_ID) {
        const pinnedItem = this.contextPinnedItem();
        if (pinnedItem) {
          void this.treeService.unpinEntry(pinnedItem.entry.entryId);
        }
      } else {
        const node = this.contextNode();
        if (node) {
          action.handler?.(node);
        }
      }

      const emitNode = this.contextNode();
      const emitRow = this.contextRow();
      if (emitNode && emitRow) {
        this.contextMenuAction.emit({
          node: emitNode,
          row: emitRow,
          action,
          event,
          pinnedEntry: this.contextPinnedItem()?.entry,
          target: this.contextTarget() ?? undefined,
        });
      }
    } finally {
      this.onMenuClosed();
    }
  }

  public onMenuClosed(): void {
    this.isContextMenuOpen.set(false);
    this.contextRow.set(null);
    this.contextNode.set(null);
    this.contextPinnedItem.set(null);
    this.contextTarget.set(null);
    this.contextEvent.set(null);
    this.currentContextButton.set(null);
  }

  public isActionDisabled(action: TreeContextAction<T>): boolean {
    if (action.id === TreeExplorerComponent.PIN_ACTION_ID) {
      return false;
    }
    if (action.id === TreeExplorerComponent.UNPIN_ACTION_ID) {
      return false;
    }

    const row = this.contextRow();
    if (!row || row.placeholder) {
      return true;
    }
    return action.disabled ? action.disabled(row.data) : false;
  }

  public getContextActions(): TreeContextAction<T>[] {
    if (this.contextTarget() === 'pinned') {
      const pinnedItem = this.contextPinnedItem();
      return pinnedItem ? this.getPinnedContextActions(pinnedItem) : [];
    }

    const row = this.contextRow();
    const node = this.contextNode();
    if (!row || !node) {
      return [];
    }
    return this.getNodeContextActions(row, node);
  }

  public getActionLabel(action: TreeContextAction<T>): string {
    if (action.id === TreeExplorerComponent.PIN_ACTION_ID) {
      return 'Star';
    }
    if (action.id === TreeExplorerComponent.UNPIN_ACTION_ID) {
      return 'Unstar';
    }

    const row = this.contextRow();
    if (!row || row.placeholder) {
      return '';
    }
    return action.label(row.data);
  }

  public getActionIcon(action: TreeContextAction<T>): string | null {
    if (action.id === TreeExplorerComponent.PIN_ACTION_ID) {
      return 'star';
    }
    if (action.id === TreeExplorerComponent.UNPIN_ACTION_ID) {
      return 'star_outline';
    }

    const row = this.contextRow();
    if (!row || row.placeholder || !action.icon) {
      return null;
    }
    return action.icon(row.data);
  }

  public trackByRowId = (_: number, row: TreeRowViewModel<T>): string =>
    row.id;

  public ensureViewportRangeLoaded(): void {
    const viewport = this.viewport();
    if (!viewport) {
      return;
    }

    const range = viewport.getRenderedRange();
    this.treeService.ensureRangeLoaded(range.start, range.end);
  }

  private getNodeContextActions(
    row: TreeRowViewModel<T>,
    node: TreeNode<T>,
  ): TreeContextAction<T>[] {
    if (row.placeholder) {
      return [];
    }

    const actions = [...(this.treeConfig().actions ?? [])].filter((action) =>
      action.visible ? action.visible(row.data) : true,
    );

    if (this.canPinNode(node)) {
      actions.push({
        id: TreeExplorerComponent.PIN_ACTION_ID,
        label: () => 'Star',
        icon: () => 'star',
      });
    }

    return actions;
  }

  private getPinnedContextActions(
    item: TreePinnedItemView<T>,
  ): TreeContextAction<T>[] {
    const actions: TreeContextAction<T>[] = [];
    const pinnedActions = this.treeConfig().pinned?.contextActions ?? [];

    if (item.row && !item.row.placeholder && item.node) {
      for (const action of pinnedActions) {
        if (action.visible ? action.visible(item.row.data) : true) {
          actions.push(action);
        }
      }
    }

    if (this.canUnpin(item.entry)) {
      actions.push({
        id: TreeExplorerComponent.UNPIN_ACTION_ID,
        label: () => 'Unstar',
        icon: () => 'star_outline',
      });
    }

    return actions;
  }

  private canPinNode(node: TreeNode<T>): boolean {
    if (!this.pinnedConfig().enabled) {
      return false;
    }

    if (this.treeService.isNodePinned(node.id)) {
      return false;
    }

    const canPin = this.treeConfig().pinned?.canPin;
    if (!canPin) {
      return true;
    }

    const context: TreePinnedNodeContext<T> = {
      node,
      pinnedEntries: this.treeService.pinnedEntries(),
    };
    return canPin(context);
  }

  private canUnpin(entry: TreePinnedEntry): boolean {
    const canUnpin = this.treeConfig().pinned?.canUnpin;
    if (!canUnpin) {
      return true;
    }

    const pinnedItem = this.pinnedItems().find(
      (item) => item.entry.entryId === entry.entryId,
    );
    return canUnpin({
      entry,
      node: pinnedItem?.node ?? undefined,
      row: pinnedItem?.row ?? undefined,
      pinnedEntries: this.treeService.pinnedEntries(),
    });
  }

  private async navigateToNode(nodeId: string): Promise<void> {
    const result = await this.treeService.navigateToNode(nodeId);
    if (!result.success) {
      return;
    }

    if (this.treeConfig().selection?.mode !== SELECTION_MODES.NONE) {
      this.treeService.selectOne(nodeId);
    }

    this.treeConfig().pinned?.onNavigate?.(nodeId);

    queueMicrotask(() => {
      const rows = this.visibleRows();
      const index = rows.findIndex((row) => row.id === nodeId);
      if (index >= 0) {
        const viewport = this.viewport();
        viewport?.scrollToIndex(index);
        this.focusRowInViewport(nodeId);
      }
    });
  }

  private focusRowInViewport(nodeId: string, attemptsLeft = 8): void {
    const viewport = this.viewport();
    const host = viewport?.elementRef.nativeElement as HTMLElement | undefined;
    if (!host) {
      return;
    }

    const rowElement = Array.from(
      host.querySelectorAll<HTMLElement>('[data-tree-row-id]'),
    ).find((element) => element.getAttribute('data-tree-row-id') === nodeId);

    if (rowElement) {
      rowElement.focus({ preventScroll: true });
      return;
    }

    if (attemptsLeft <= 0) {
      return;
    }

    requestAnimationFrame(() => {
      this.focusRowInViewport(nodeId, attemptsLeft - 1);
    });
  }

  private mergeConfig(config: Partial<TreeConfig<T>>): TreeConfig<T> {
    const defaults = DEFAULT_TREE_CONFIG as TreeConfig<T>;
    const defaultDisplay = defaults.display ?? {
      indentPx: 24,
      density: DEFAULT_TREE_CONFIG.display!.density,
      showIcons: true,
    };
    const defaultVirtualization = defaults.virtualization ?? {
      mode: DEFAULT_TREE_CONFIG.virtualization!.mode,
      itemSize: DEFAULT_TREE_CONFIG.virtualization!.itemSize,
    };
    const defaultFiltering = defaults.filtering ?? DEFAULT_TREE_CONFIG.filtering;

    return {
      ...defaults,
      ...config,
      display: {
        indentPx: config.display?.indentPx ?? defaultDisplay.indentPx,
        density: config.display?.density ?? defaultDisplay.density,
        showIcons: config.display?.showIcons ?? defaultDisplay.showIcons,
      },
      selection: config.selection ?? defaults.selection,
      virtualization: {
        mode: config.virtualization?.mode ?? defaultVirtualization.mode,
        itemSize: config.virtualization?.itemSize ?? defaultVirtualization.itemSize,
      },
      filtering: {
        ...defaultFiltering,
        ...config.filtering,
      },
      actions: config.actions ?? defaults.actions,
      dragDrop: config.dragDrop ?? defaults.dragDrop,
      pinned: config.pinned ?? defaults.pinned,
      onError: config.onError ?? defaults.onError,
    };
  }
}

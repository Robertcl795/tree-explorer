import { CommonModule } from '@angular/common';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  DEFAULT_TREE_CONFIG,
  SELECTION_MODES,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeContextAction,
  TreeLoadError,
  TreeNode,
  TreeRowViewModel,
} from '@tree-core';
import {
  TreeContextMenuEvent,
  TreeDragEvent,
  TreeNodeEvent,
  TreeSelectionEvent,
} from '../../types';
import { TreeStateService } from '../../services/tree.service';
import { TreeItemComponent } from '../tree-item/tree-item.component';

@Component({
  selector: 'tree-explorer',
  standalone: true,
  imports: [
    CommonModule,
    ScrollingModule,
    MatProgressBarModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    TreeItemComponent,
  ],
  providers: [TreeStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tree-explorer.component.html',
  styleUrl: './tree-explorer.component.scss',
})
export class TreeExplorerComponent<TSource, T = TSource> {
  public readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');
  public readonly contextMenuTrigger = viewChild(MatMenuTrigger);

  public readonly data = input<TreeChildrenResult<TSource> | TSource[]>([]);
  public readonly loading = input(false);
  public readonly adapter = input.required<TreeAdapter<TSource, T>>();
  public readonly config = input<Partial<TreeConfig<T>>>({});

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
  public readonly contextEvent = signal<MouseEvent | null>(null);
  public readonly menuX = signal(0);
  public readonly menuY = signal(0);

  public readonly treeConfig = computed(() =>
    this.mergeConfig(this.config()),
  );

  public readonly displayConfig = computed(() => ({
    indentPx: this.treeConfig().display?.indentPx ?? 24,
    density: this.treeConfig().display?.density ?? DEFAULT_TREE_CONFIG.display?.density,
    showIcons: this.treeConfig().display?.showIcons ?? true,
  }));

  public readonly itemSize = computed(
    () => this.treeConfig().virtualization?.itemSize ?? 48,
  );

  public readonly isLoading = computed(
    () => this.loading() || this.treeService.loading(),
  );

  public readonly rootLoadError = computed(
    () => this.treeService.rootLoadError(),
  );

  public readonly visibleRows = computed(() => this.treeService.visibleRows());

  public readonly pinnedRows = computed(() =>
    this.treeService.getPinnedRows(this.treeConfig().pinned?.ids ?? []),
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
      this.viewport()?.checkViewportSize();
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
  }

  public hasContextActions(row: TreeRowViewModel<T>): boolean {
    return this.getVisibleActions(row).length > 0;
  }

  public onRowClick(event: MouseEvent, row: TreeRowViewModel<T>): void {
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

  public onPinnedClick(event: MouseEvent, row: TreeRowViewModel<T>): void {
    this.scrollToRow(row.id);
    this.onRowClick(event, row);
  }

  public onRowDoubleClick(event: MouseEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (node) {
      this.itemDoubleClick.emit({ node, row, event });
    }
  }

  public onToggleExpand(event: MouseEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (!node || row.disabled || row.isLeaf) {
      return;
    }

    this.treeService.toggleExpand(row);
    this.itemToggleExpand.emit({ node, row, event });
  }

  public onToggleSelect(event: MouseEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (!node || row.disabled) {
      return;
    }

    if (this.treeConfig().selection?.mode !== SELECTION_MODES.NONE) {
      this.treeService.toggleSelect(row);
      this.itemToggleSelect.emit({ node, row, event });
    }
  }

  public onDragStart(event: DragEvent, row: TreeRowViewModel<T>): void {
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
    if (node) {
      this.dragOver.emit({ node, row, event });
    }
  }

  public onDrop(event: DragEvent, row: TreeRowViewModel<T>): void {
    event.preventDefault();
    const node = this.treeService.getNode(row.id);
    if (node) {
      this.drop.emit({ node, row, event });
    }
  }

  public onDragEnd(event: DragEvent, row: TreeRowViewModel<T>): void {
    const node = this.treeService.getNode(row.id);
    if (node) {
      this.dragEnd.emit({ node, row, event });
    }
  }

  public openContextMenu(event: MouseEvent, row: TreeRowViewModel<T>): void {
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
    this.contextEvent.set(event);
    this.menuX.set(event.clientX);
    this.menuY.set(event.clientY);

    queueMicrotask(() => this.contextMenuTrigger()?.openMenu());
  }

  public onContextAction(action: TreeContextAction<T>): void {
    const node = this.contextNode();
    const row = this.contextRow();
    const event = this.contextEvent();
    if (!node || !row || !event) {
      return;
    }

    try {
      action.handler?.(node);
      this.contextMenuAction.emit({ node, row, action, event });
    } finally {
      this.contextMenuTrigger()?.closeMenu();
    }
  }

  public onMenuClosed(): void {
    this.contextRow.set(null);
    this.contextNode.set(null);
    this.contextEvent.set(null);
  }

  public isActionDisabled(action: TreeContextAction<T>): boolean {
    const row = this.contextRow();
    if (!row) {
      return true;
    }
    return action.disabled ? action.disabled(row.data) : false;
  }

  public getContextActions(): TreeContextAction<T>[] {
    const row = this.contextRow();
    if (!row) {
      return [];
    }
    return this.getVisibleActions(row);
  }

  private getVisibleActions(row: TreeRowViewModel<T>): TreeContextAction<T>[] {
    const actions = this.treeConfig().actions ?? [];
    return actions.filter((action) =>
      action.visible ? action.visible(row.data) : true,
    );
  }

  private scrollToRow(nodeId: string): void {
    this.treeService.expandToNode(nodeId);
    queueMicrotask(() => {
      const rows = this.visibleRows();
      const index = rows.findIndex((row) => row.id === nodeId);
      if (index >= 0) {
        this.viewport()?.scrollToIndex(index);
      }
    });
  }

  private mergeConfig(config: Partial<TreeConfig<T>>): TreeConfig<T> {
    const defaults = DEFAULT_TREE_CONFIG as TreeConfig<T>;
    return {
      ...defaults,
      ...config,
      display: {
        ...defaults.display,
        ...config.display,
      },
      selection: config.selection ?? defaults.selection,
      virtualization: {
        ...defaults.virtualization,
        ...config.virtualization,
      },
      actions: config.actions ?? defaults.actions,
      dragDrop: config.dragDrop ?? defaults.dragDrop,
      pinned: config.pinned ?? defaults.pinned,
      onError: config.onError ?? defaults.onError,
    };
  }
}


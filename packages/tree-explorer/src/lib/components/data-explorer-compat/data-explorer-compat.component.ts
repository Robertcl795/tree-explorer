import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeFilterInput,
  TreeLoadError,
  TreeNode,
} from '@tree-core';
import {
  TreeContextMenuEvent,
  TreeDragEvent,
  TreeNodeEvent,
} from '../../types';
import { AsyncTreeComponent } from '../async-tree/async-tree.component';

@Component({
  selector: 'td-tree',
  standalone: true,
  imports: [CommonModule, AsyncTreeComponent],
  templateUrl: './data-explorer-compat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataExplorerCompatComponent<TSource, T = TSource> {
  public readonly adapter = input.required<TreeAdapter<TSource, T>>();
  public readonly sources = input<TreeChildrenResult<TSource> | TSource[]>([]);
  public readonly config = input<Partial<TreeConfig<T>>>({});
  public readonly searchTerm = input<TreeFilterInput>(null);
  public readonly loading = input(false);
  public readonly watchOutsideOf = input<string[]>([]);
  public readonly watchInsideOf = input<string[]>([]);

  public readonly nodeClicked = output<TreeNode<T>>();
  public readonly directoryClicked = output<TreeNode<T>>();
  public readonly unsupportedNodeClicked = output<TreeNode<T>>();
  public readonly nodeExpanded = output<TreeNode<T>>();
  public readonly nodeCollapsed = output<TreeNode<T>>();
  public readonly nodeSelected = output<TreeNode<T>[]>();
  public readonly nodeHighlighted = output<TreeNode<T> | null>();
  public readonly nodeLoaded = output<{ parent: TreeNode<T>; children: TreeNode<T>[] }>();
  public readonly contextMenuAction = output<TreeContextMenuEvent<T>>();
  public readonly keyboardAction = output<{ node: TreeNode<T>; action: string }>();
  public readonly loadError = output<TreeLoadError>();
  public readonly dragStart = output<TreeDragEvent<T>>();
  public readonly dragOver = output<TreeDragEvent<T>>();
  public readonly drop = output<TreeDragEvent<T>>();
  public readonly dragEnd = output<TreeDragEvent<T>>();

  public handleNodeClick(event: TreeNodeEvent<T>): void {
    if (event.row.isLeaf) {
      this.nodeClicked.emit(event.node);
    } else {
      this.directoryClicked.emit(event.node);
    }
    this.nodeHighlighted.emit(event.node);
  }

  public handleNodeDoubleClick(event: TreeNodeEvent<T>): void {
    if (event.row.isLeaf) {
      this.nodeClicked.emit(event.node);
    } else {
      this.directoryClicked.emit(event.node);
    }
  }
}

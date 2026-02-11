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
import { TreeExplorerComponent } from '../tree-explorer/tree-explorer.component';

@Component({
  selector: 'async-tree',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  templateUrl: './async-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AsyncTreeComponent<TSource, T = TSource> {
  public readonly data = input<TreeChildrenResult<TSource> | TSource[]>([]);
  public readonly loading = input(false);
  public readonly adapter = input.required<TreeAdapter<TSource, T>>();
  public readonly config = input<Partial<TreeConfig<T>>>({});
  public readonly filterQuery = input<TreeFilterInput>(null);

  public readonly nodeClicked = output<TreeNodeEvent<T>>();
  public readonly nodeDoubleClicked = output<TreeNodeEvent<T>>();
  public readonly nodeExpanded = output<TreeNodeEvent<T>>();
  public readonly nodeCollapsed = output<TreeNodeEvent<T>>();
  public readonly nodeSelected = output<TreeNode<T>[]>();
  public readonly contextMenuAction = output<TreeContextMenuEvent<T>>();
  public readonly loadError = output<TreeLoadError>();
  public readonly dragStart = output<TreeDragEvent<T>>();
  public readonly dragOver = output<TreeDragEvent<T>>();
  public readonly drop = output<TreeDragEvent<T>>();
  public readonly dragEnd = output<TreeDragEvent<T>>();

  public onToggleExpand(event: TreeNodeEvent<T>): void {
    if (event.row.expanded) {
      this.nodeCollapsed.emit(event);
      return;
    }
    this.nodeExpanded.emit(event);
  }
}

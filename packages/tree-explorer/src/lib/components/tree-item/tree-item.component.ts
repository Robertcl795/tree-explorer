import { CommonModule } from '@angular/common';
import '@covalent/components/circular-progress';
import '@covalent/components/checkbox';
import '@covalent/components/icon';
import '@covalent/components/icon-button';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  input,
  output,
} from '@angular/core';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeFilterInput,
  TreeDisplayConfig,
  TreeRowViewModel,
} from '@tree-core';
import { TreeHighlightMatchPipe } from '../../pipes';

@Component({
  selector: 'td-tree-item',
  standalone: true,
  imports: [
    CommonModule,
    TreeHighlightMatchPipe,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './tree-item.component.html',
  styleUrls: ['./tree-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'td-tree-node',
    '[style.--tree-row-height.px]': 'itemSize()',
    '[class.td-tree-node-compact]':
      'display().density === treeDensity.COMPACT',
    '[class.td-tree-node-disabled]': 'row().disabled',
    '[class.td-tree-node-loading]': 'row().loading',
    '[class.td-tree-node-selected]': 'row().selected || row().indeterminate',
    '[class.td-tree-node-error]': 'row().error',
    '[class.td-tree-node-placeholder]': 'row().placeholder',
    '[attr.role]': '"treeitem"',
    '[attr.aria-level]': 'row().level + 1',
    '[attr.aria-expanded]': 'row().isLeaf ? null : row().expanded',
    '[attr.aria-selected]': 'row().selected',
    '[attr.aria-indeterminate]': 'row().indeterminate',
    '[attr.aria-disabled]': 'row().disabled',
    '[attr.data-node-id]': 'row().id',
    '[attr.tabindex]': 'row().disabled ? -1 : 0',
    '[style.padding-left.px]': 'row().level * display().indentPx + 6',
    '[attr.draggable]':
      'dragDropEnabled() && !row().disabled ? true : null',
    '(click)': 'rowClick.emit($event)',
    '(dblclick)': 'rowDoubleClick.emit($event)',
    '(contextmenu)': 'onContextMenu($event)',
    '(dragstart)': 'onDragStart($event)',
    '(dragover)': 'onDragOver($event)',
    '(drop)': 'onDrop($event)',
    '(dragend)': 'onDragEnd($event)',
  },
})
export class TreeItemComponent<T = any> {
  public readonly treeDensity = TREE_DENSITY;
  public readonly selectionModes = SELECTION_MODES;

  public readonly row = input.required<TreeRowViewModel<T>>();
  public readonly display = input.required<TreeDisplayConfig>();
  public readonly itemSize = input(32);
  public readonly selectionMode = input<SELECTION_MODES | undefined>();
  public readonly showContextButton = input(false);
  public readonly dragDropEnabled = input(false);
  public readonly filterQuery = input<TreeFilterInput>(null);

  public readonly rowClick = output<MouseEvent>();
  public readonly rowDoubleClick = output<MouseEvent>();
  public readonly toggleExpand = output<MouseEvent>();
  public readonly toggleSelect = output<Event>();
  public readonly contextMenuRequest = output<MouseEvent>();
  public readonly contextButtonRequest = output<MouseEvent>();
  public readonly dragStart = output<DragEvent>();
  public readonly dragOver = output<DragEvent>();
  public readonly drop = output<DragEvent>();
  public readonly dragEnd = output<DragEvent>();

  public readonly leftPadding = computed(() =>
    this.row().level * this.display().indentPx,
  );

  public readonly showCheckbox = computed(
    () => this.selectionMode() === SELECTION_MODES.MULTI,
  );

  public onExpandClick(event: any): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.row().disabled || this.row().isLeaf) {
      return;
    }
    this.toggleExpand.emit(event);
  }

  public onSelectClick(event: unknown): void {
    const uiEvent = event as {
      preventDefault?: () => void;
      stopPropagation?: () => void;
    };
    uiEvent.preventDefault?.();
    uiEvent.stopPropagation?.();
    if (this.row().disabled) {
      return;
    }
    this.toggleSelect.emit(event as Event);
  }

  public onContextMenu(event: MouseEvent): void {
    if (!this.showContextButton() || this.row().disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuRequest.emit(event);
  }

  public onContextButtonClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.showContextButton() || this.row().disabled) {
      return;
    }
    this.contextButtonRequest.emit(event);
  }

  public onDragStart(event: DragEvent): void {
    if (!this.dragDropEnabled() || this.row().disabled) {
      event.preventDefault();
      return;
    }
    this.dragStart.emit(event);
  }

  public onDragOver(event: DragEvent): void {
    if (!this.dragDropEnabled() || this.row().disabled) {
      return;
    }
    this.dragOver.emit(event);
  }

  public onDrop(event: DragEvent): void {
    if (!this.dragDropEnabled() || this.row().disabled) {
      return;
    }
    this.drop.emit(event);
  }

  public onDragEnd(event: DragEvent): void {
    if (!this.dragDropEnabled()) {
      return;
    }
    this.dragEnd.emit(event);
  }
}

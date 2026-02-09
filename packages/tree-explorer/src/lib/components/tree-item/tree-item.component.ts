import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  SELECTION_MODES,
  TreeDisplayConfig,
  TreeRowViewModel,
} from '@tree-core';

@Component({
  selector: 'td-tree-item',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './tree-item.component.html',
  styleUrl: './tree-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeItemComponent<T = any> {
  public readonly row = input.required<TreeRowViewModel<T>>();
  public readonly display = input.required<TreeDisplayConfig>();
  public readonly selectionMode = input<SELECTION_MODES | undefined>();
  public readonly showContextButton = input(false);
  public readonly dragDropEnabled = input(false);

  public readonly rowClick = output<MouseEvent>();
  public readonly rowDoubleClick = output<MouseEvent>();
  public readonly toggleExpand = output<MouseEvent>();
  public readonly toggleSelect = output<MouseEvent>();
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

  public onExpandClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.row().disabled || this.row().isLeaf) {
      return;
    }
    this.toggleExpand.emit(event);
  }

  public onSelectClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.row().disabled) {
      return;
    }
    this.toggleSelect.emit(event);
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


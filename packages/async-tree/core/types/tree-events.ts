import type {
  TreeContextAction,
  TreeNode,
  TreePinnedEntry,
  TreeRowViewModel,
} from '../../core';

export interface TreeNodeEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  event: Event;
}

export interface TreeContextMenuEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  pinnedEntry?: TreePinnedEntry;
  target?: 'node' | 'pinned';
  action: TreeContextAction<T>;
  event: Event;
}

export interface TreeSelectionEvent<T> {
  nodes: TreeNode<T>[];
}

export interface TreeDragEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  event: DragEvent;
}

export interface TreePinnedItemView<T> {
  entry: TreePinnedEntry;
  node: TreeNode<T> | null;
  row: TreeRowViewModel<T> | null;
  label: string;
  icon?: string | null;
  missing: boolean;
}

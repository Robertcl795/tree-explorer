import { TreeContextAction, TreeNode, TreeRowViewModel } from '@tree-core';

export type {
  PageRequest,
  PageResult,
  SelectionMode,
  TreeAdapter,
  TreeConfig,
  TreeDisplayConfig,
  TreeLoadError,
  TreePaginationConfig,
} from '@tree-core';
export type { TreeContextAction, TreeNode, TreeRowViewModel } from '@tree-core';

export interface TreeNodeEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  event: Event;
}

export interface TreeContextMenuEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
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

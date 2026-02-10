import { TreeMatchRange } from './tree-filter';

export type TreeId = string;

/** Minimal, serializable tree node model. */
export interface TreeNode<T> {
  id: TreeId;
  parentId?: TreeId | null;
  level: number;
  childrenIds?: readonly TreeId[];
  data: T;
  isLeaf?: boolean;
  disabled?: boolean;
  placeholder?: boolean;
  placeholderIndex?: number;
}

/** View model derived from node state + adapter-provided presentation data. */
export interface TreeRowViewModel<T> {
  id: TreeId;
  parentId?: TreeId | null;
  level: number;
  label: string;
  icon?: string | null;
  isLeaf: boolean;
  disabled: boolean;
  visible: boolean;
  expanded: boolean;
  selected: boolean;
  indeterminate: boolean;
  loading: boolean;
  error?: boolean;
  highlightRanges?: readonly TreeMatchRange[];
  childrenIds?: readonly TreeId[];
  data: T;
  placeholder?: boolean;
  placeholderIndex?: number;
}

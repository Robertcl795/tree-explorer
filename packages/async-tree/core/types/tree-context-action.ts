import { TreeNode } from './tree-node';

export interface TreeContextAction<T> {
  /** Unique action identifier. */
  id: string;
  /** Label renderer for the action. */
  label: (item: T) => string;
  /** Optional icon renderer. */
  icon?: (item: T) => string;
  /** Optional disabled state resolver. */
  disabled?: (item: T) => boolean;
  /** Optional visibility resolver. */
  visible?: (item: T) => boolean;
  /** Action handler invoked on selection. */
  handler?: (node: TreeNode<T>) => void;
  /** Optional metadata string shown in the menu. */
  meta?: (item: T) => string;
  /** Optional divider toggle after the action. */
  showDividerAfter?: (item: T) => boolean;
}


import type { Observable } from 'rxjs';

import { TreeContextAction } from './tree-context-action';
import { TreeId, TreeNode, TreeRowViewModel } from './tree-node';

export interface TreePinnedEntry {
  /** Stable identifier of the pinned record (usually backend record id). */
  entryId: string;
  /** Identifier of the original node in the tree graph. */
  nodeId: TreeId;
  /** Optional cached display label. */
  label?: string;
  /** Optional cached icon. */
  icon?: string;
  /** Ordering index in the pinned collection. */
  order: number;
  /** Optional record metadata. */
  meta?: unknown;
}

export interface TreePinnedNodeContext<T> {
  node: TreeNode<T>;
  pinnedEntries: readonly TreePinnedEntry[];
}

export interface TreePinnedEntryContext<T> {
  entry: TreePinnedEntry;
  node?: TreeNode<T>;
  row?: TreeRowViewModel<T>;
  pinnedEntries: readonly TreePinnedEntry[];
}

export interface TreePinnedRenderContext<T> {
  entry: TreePinnedEntry;
  node?: TreeNode<T>;
  row?: TreeRowViewModel<T>;
}

export interface TreePinnedItemView<T> {
  entry: TreePinnedEntry;
  node: TreeNode<T> | null;
  row: TreeRowViewModel<T> | null;
  label: string;
  icon?: string | null;
  missing: boolean;
}

export type TreePinnedStoreResult<TResult> = Promise<TResult> | Observable<TResult>;

export interface TreePinnedStore<T> {
  loadPinned?: () => TreePinnedStoreResult<TreePinnedEntry[]>;
  addPinned?: (node: TreeNode<T>) => TreePinnedStoreResult<TreePinnedEntry>;
  removePinned?: (
    entry: TreePinnedEntry,
    node?: TreeNode<T>,
  ) => TreePinnedStoreResult<void>;
  reorderPinned?: (
    entries: TreePinnedEntry[],
  ) => TreePinnedStoreResult<void>;
}

export interface TreePinnedConfig<T> {
  /** Feature toggle. Disabled by default unless legacy ids/entries are provided. */
  enabled?: boolean;
  /** Section label shown in the wrapper UI. */
  label?: string;
  /** Legacy shorthand for static pinned node ids. */
  ids?: TreeId[];
  /** Static pinned entry records (preferred over ids). */
  entries?: TreePinnedEntry[];
  /** Optional external store integration for persistence. */
  store?: TreePinnedStore<T>;
  /** Optional cap to guard against unbounded pinned growth. */
  maxItems?: number;
  /** Reserved for future expandable pinned shortcuts; currently UI-only shortcut list. */
  expandable?: boolean;
  /** Pin action eligibility gate for regular node targets. */
  canPin?: (context: TreePinnedNodeContext<T>) => boolean;
  /** Unpin action eligibility gate for pinned targets. */
  canUnpin?: (context: TreePinnedEntryContext<T>) => boolean;
  /** Optional pinned-label resolver. */
  resolvePinnedLabel?: (
    entry: TreePinnedEntry,
    context: TreePinnedRenderContext<T>,
  ) => string;
  /** Optional pinned-icon resolver. */
  resolvePinnedIcon?: (
    entry: TreePinnedEntry,
    context: TreePinnedRenderContext<T>,
  ) => string | undefined;
  /** Hook fired when a pinned entry navigates to a real node. */
  onNavigate?: (nodeId: TreeId) => void;
  /** Optional extra context actions for pinned targets. */
  contextActions?: TreeContextAction<T>[];
  /** Optional drag-drop controls for pinned section ordering. */
  dnd?: {
    enabled?: boolean;
  };
}

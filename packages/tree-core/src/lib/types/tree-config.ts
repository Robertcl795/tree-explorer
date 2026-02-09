import { TreeContextAction } from './tree-context-action';
import { TreeLoadError } from './tree-errors';
import { TreeId } from './tree-node';

export enum TREE_DENSITY {
  COMPACT = 'compact',
  NORMAL = 'normal',
}

export interface TreeDisplayConfig {
  /** Indentation per nesting level in pixels. */
  indentPx: number;
  /** Visual density controls row height and spacing. */
  density: TREE_DENSITY;
  /** Show node icons when provided by the adapter. */
  showIcons: boolean;
}

export enum SELECTION_MODES {
  NONE = 'none',
  SINGLE = 'single',
  MULTI = 'multi',
}

export type SelectionMode =
  | { mode: SELECTION_MODES.NONE }
  | { mode: SELECTION_MODES.SINGLE }
  | { mode: SELECTION_MODES.MULTI; hierarchical?: boolean };

export enum VIRTUALIZATION_MODES {
  DEEP = 'deep',
  FLAT = 'flat',
  AUTO = 'auto',
}

export interface TreeVirtualizationConfig {
  /** Virtualization strategy for large trees. */
  mode: VIRTUALIZATION_MODES;
  /** Fixed item size used by the virtual scroll viewport. */
  itemSize: number;
}

export interface TreeConfig<T> {
  /** Display-related preferences. */
  display?: TreeDisplayConfig;
  /** Context menu actions defined at the tree container. */
  actions?: TreeContextAction<T>[];
  /** Selection behavior. */
  selection?: SelectionMode;
  /** Virtualization settings for large datasets. */
  virtualization?: TreeVirtualizationConfig;
  /** Enable drag and drop behavior in the UI layer. */
  dragDrop?: boolean;
  /** Optional pinned section configuration. */
  pinned?: {
    ids: TreeId[];
    label?: string;
  };
  /** Accessible label for the tree container. */
  ariaLabel?: string;
  /** Default icon when adapter does not provide one. */
  defaultIcon?: string;
  /** Optional tracking tag used by consumers. */
  trackingTag?: string;
  /** Optional error handler for load failures. */
  onError?: (error: TreeLoadError) => void;
}

export const DEFAULT_TREE_CONFIG: Readonly<TreeConfig<unknown>> = Object.freeze({
  display: {
    indentPx: 24,
    density: TREE_DENSITY.NORMAL,
    showIcons: true,
  },
  selection: { mode: SELECTION_MODES.NONE },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 48 },
  actions: [],
  dragDrop: false,
  defaultIcon: 'insert_drive_file',
  ariaLabel: 'Tree',
  trackingTag: 'tree',
});


import { TreeId } from './tree-node';

/** Error information for root or child load failures. */
export interface TreeLoadError {
  scope: 'root' | 'children';
  nodeId?: TreeId;
  pageIndex?: number;
  error: unknown;
  message?: string;
}
